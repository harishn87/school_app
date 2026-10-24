"""School transport: buses, routes with stops, and which bus/stop each student uses.

Admins manage everything; teachers can look things up; parents see their own child's
bus details through /parent/overview.
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

from ..models import BusIn, RouteIn, TransportAssignIn
from ..security import TenantContext, require_roles
from ..utils import new_id, now_iso

router = APIRouter(prefix="/transport", tags=["transport"])
STAFF = ("admin",)   # whole-school transport lists are for the school admin only


# ---------- buses ----------
@router.get("/buses")
async def list_buses(ctx: TenantContext = Depends(require_roles(*STAFF))):
    buses = await ctx.db.buses.find({}, {"_id": 0}).sort("number", 1).to_list(500)
    counts: dict = {}
    async for r in ctx.db.routes.find({}, {"_id": 0, "id": 1, "bus_id": 1}):
        if r.get("bus_id"):
            n = await ctx.db.transport.count_documents({"route_id": r["id"]})
            counts[r["bus_id"]] = counts.get(r["bus_id"], 0) + n
    for b in buses:
        b["students"] = counts.get(b["id"], 0)
    return buses


@router.post("/buses", status_code=201)
async def create_bus(payload: BusIn, ctx: TenantContext = Depends(require_roles("admin"))):
    number = payload.number.strip()
    if await ctx.db.buses.find_one({"number": number}, {"_id": 1}):
        raise HTTPException(status_code=409, detail=f"A bus called “{number}” already exists")
    doc = {"id": new_id(), **payload.model_dump(), "number": number, "created_at": now_iso()}
    await ctx.db.buses.insert_one(dict(doc))
    return doc


@router.put("/buses/{bus_id}")
async def update_bus(bus_id: str, payload: BusIn, ctx: TenantContext = Depends(require_roles("admin"))):
    number = payload.number.strip()
    if await ctx.db.buses.find_one({"number": number, "id": {"$ne": bus_id}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail=f"A bus called “{number}” already exists")
    res = await ctx.db.buses.update_one({"id": bus_id}, {"$set": {**payload.model_dump(), "number": number}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Bus not found")
    return await ctx.db.buses.find_one({"id": bus_id}, {"_id": 0})


@router.delete("/buses/{bus_id}")
async def delete_bus(bus_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    used = await ctx.db.routes.find_one({"bus_id": bus_id}, {"_id": 0, "name": 1})
    if used:
        raise HTTPException(status_code=409, detail=f"This bus is used by the route “{used['name']}”. Move that route to another bus first.")
    res = await ctx.db.buses.delete_one({"id": bus_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bus not found")
    return {"ok": True}


# ---------- routes ----------
async def _check_bus(ctx: TenantContext, bus_id: Optional[str]) -> None:
    if bus_id and not await ctx.db.buses.find_one({"id": bus_id}, {"_id": 1}):
        raise HTTPException(status_code=400, detail="Bus not found")


def _clean_stops(stops) -> list:
    out, seen = [], set()
    for s in stops:
        name = s.name.strip()
        if name.lower() in seen:
            raise HTTPException(status_code=400, detail=f"The stop “{name}” is listed twice")
        seen.add(name.lower())
        out.append({"name": name, "pickup_time": s.pickup_time, "drop_time": s.drop_time})
    return out


@router.get("/routes")
async def list_routes(ctx: TenantContext = Depends(require_roles(*STAFF))):
    buses = {b["id"]: b async for b in ctx.db.buses.find({}, {"_id": 0})}
    routes = await ctx.db.routes.find({}, {"_id": 0}).sort("name", 1).to_list(500)
    for r in routes:
        r["bus"] = buses.get(r.get("bus_id"))
        r["students"] = await ctx.db.transport.count_documents({"route_id": r["id"]})
    return routes


@router.post("/routes", status_code=201)
async def create_route(payload: RouteIn, ctx: TenantContext = Depends(require_roles("admin"))):
    await _check_bus(ctx, payload.bus_id)
    name = payload.name.strip()
    if await ctx.db.routes.find_one({"name": name}, {"_id": 1}):
        raise HTTPException(status_code=409, detail=f"A route called “{name}” already exists")
    doc = {"id": new_id(), "name": name, "bus_id": payload.bus_id, "stops": _clean_stops(payload.stops), "created_at": now_iso()}
    await ctx.db.routes.insert_one(dict(doc))
    return doc


@router.put("/routes/{route_id}")
async def update_route(route_id: str, payload: RouteIn, ctx: TenantContext = Depends(require_roles("admin"))):
    await _check_bus(ctx, payload.bus_id)
    name = payload.name.strip()
    if await ctx.db.routes.find_one({"name": name, "id": {"$ne": route_id}}, {"_id": 1}):
        raise HTTPException(status_code=409, detail=f"A route called “{name}” already exists")
    stops = _clean_stops(payload.stops)
    # A stop can't be removed while students still use it.
    names = {s["name"] for s in stops}
    async for a in ctx.db.transport.find({"route_id": route_id}, {"_id": 0, "stop": 1}):
        if a["stop"] not in names:
            raise HTTPException(status_code=409, detail=f"Students are still assigned to the stop “{a['stop']}”. Move them first.")
    res = await ctx.db.routes.update_one({"id": route_id}, {"$set": {"name": name, "bus_id": payload.bus_id, "stops": stops}})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Route not found")
    return await ctx.db.routes.find_one({"id": route_id}, {"_id": 0})


@router.delete("/routes/{route_id}")
async def delete_route(route_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    n = await ctx.db.transport.count_documents({"route_id": route_id})
    if n:
        raise HTTPException(status_code=409, detail=f"{n} student{'s are' if n != 1 else ' is'} assigned to this route. Move them first.")
    res = await ctx.db.routes.delete_one({"id": route_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Route not found")
    return {"ok": True}


# ---------- student assignments ----------
@router.get("/assignments")
async def list_assignments(route_id: Optional[str] = None, ctx: TenantContext = Depends(require_roles(*STAFF))):
    return await ctx.db.transport.find({"route_id": route_id} if route_id else {}, {"_id": 0}).to_list(10000)


@router.put("/assignments/{student_id}")
async def assign_student(student_id: str, payload: TransportAssignIn, ctx: TenantContext = Depends(require_roles("admin"))):
    if not await ctx.db.students.find_one({"id": student_id}, {"_id": 1}):
        raise HTTPException(status_code=404, detail="Student not found")
    route = await ctx.db.routes.find_one({"id": payload.route_id}, {"_id": 0})
    if not route:
        raise HTTPException(status_code=400, detail="Route not found")
    if payload.stop not in {s["name"] for s in route["stops"]}:
        raise HTTPException(status_code=400, detail="That stop isn't on this route")
    doc = {"student_id": student_id, "route_id": payload.route_id, "stop": payload.stop, "mode": payload.mode, "updated_at": now_iso()}
    await ctx.db.transport.update_one({"student_id": student_id}, {"$set": doc}, upsert=True)
    return doc


@router.delete("/assignments/{student_id}")
async def unassign_student(student_id: str, ctx: TenantContext = Depends(require_roles("admin"))):
    await ctx.db.transport.delete_one({"student_id": student_id})
    return {"ok": True}


async def transport_for_student(ctx: TenantContext, student_id: str) -> Optional[dict]:
    """Bus details for one student in the shape the parent app shows. None if not on a bus."""
    a = await ctx.db.transport.find_one({"student_id": student_id}, {"_id": 0})
    if not a:
        return None
    route = await ctx.db.routes.find_one({"id": a["route_id"]}, {"_id": 0})
    if not route:
        return None
    bus = await ctx.db.buses.find_one({"id": route.get("bus_id")}, {"_id": 0}) if route.get("bus_id") else None
    stop = next((s for s in route["stops"] if s["name"] == a["stop"]), {})
    return {
        "route_name": route["name"], "stop": a["stop"], "mode": a.get("mode", "both"),
        "pickup_time": stop.get("pickup_time"), "drop_time": stop.get("drop_time"),
        "bus_number": bus["number"] if bus else None, "registration": bus.get("registration") if bus else None,
        "driver_name": bus.get("driver_name") if bus else None, "driver_phone": bus.get("driver_phone") if bus else None,
        "attendant_name": bus.get("attendant_name") if bus else None, "attendant_phone": bus.get("attendant_phone") if bus else None,
    }
