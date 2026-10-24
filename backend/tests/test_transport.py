from conftest import login, signup
from test_school_api import _make_user


def _setup(server, new_client):
    signup(server, "greenwood")
    _make_user(server, "teacher", "t1@greenwood.example.com")
    _make_user(server, "parent", "mom@family.example.com")
    _make_user(server, "parent", "other@family.example.com")
    kid = server.post("/api/students", json={"first_name": "Aarav", "last_name": "Sharma", "joining_date": "2025-06-01",
                                             "guardian_email": "mom@family.example.com"}).json()
    kid2 = server.post("/api/students", json={"first_name": "Zed", "last_name": "Other", "joining_date": "2025-06-01",
                                              "guardian_email": "other@family.example.com"}).json()
    def as_(email):
        c = new_client(); assert login(c, "greenwood", email).status_code == 200; return c
    bus = server.post("/api/transport/buses", json={"number": "Bus 7", "registration": "TS09 AB 1234", "capacity": 40,
                                                   "driver_name": "Ramesh", "driver_phone": "98450 11111"}).json()
    route = server.post("/api/transport/routes", json={"name": "Route A", "bus_id": bus["id"], "stops": [
        {"name": "Kukatpally", "pickup_time": "07:15", "drop_time": "16:40"}, {"name": "Miyapur", "pickup_time": "07:30", "drop_time": "16:25"}]}).json()
    return {"admin": server, "teacher": as_("t1@greenwood.example.com"), "mom": as_("mom@family.example.com"),
            "other": as_("other@family.example.com"), "bus": bus, "route": route, "kid": kid, "kid2": kid2}


def test_roles(server, new_client):
    x = _setup(server, new_client)
    assert x["teacher"].get("/api/transport/routes").status_code == 403
    assert x["teacher"].get("/api/transport/buses").status_code == 403
    assert x["teacher"].post("/api/transport/buses", json={"number": "Bus 9"}).status_code == 403
    assert x["mom"].get("/api/transport/routes").status_code == 403
    assert x["mom"].put(f"/api/transport/assignments/{x['kid']['id']}", json={"route_id": x["route"]["id"], "stop": "Miyapur"}).status_code == 403


def test_duplicates_and_validation(server, new_client):
    x = _setup(server, new_client)
    assert x["admin"].post("/api/transport/buses", json={"number": "Bus 7"}).status_code == 409
    assert x["admin"].post("/api/transport/routes", json={"name": "Route A"}).status_code == 409
    assert x["admin"].post("/api/transport/routes", json={"name": "R", "stops": [{"name": "A"}, {"name": "a"}]}).status_code == 400
    assert x["admin"].post("/api/transport/routes", json={"name": "R2", "stops": [{"name": "A", "pickup_time": "7.15"}]}).status_code == 422
    assert x["admin"].post("/api/transport/routes", json={"name": "R3", "bus_id": "nope"}).status_code == 400


def test_assignment_rules(server, new_client):
    x = _setup(server, new_client)
    sid, rid = x["kid"]["id"], x["route"]["id"]
    assert x["admin"].put(f"/api/transport/assignments/{sid}", json={"route_id": rid, "stop": "Nowhere"}).status_code == 400
    assert x["admin"].put(f"/api/transport/assignments/{sid}", json={"route_id": "nope", "stop": "Miyapur"}).status_code == 400
    assert x["admin"].put("/api/transport/assignments/nope", json={"route_id": rid, "stop": "Miyapur"}).status_code == 404
    assert x["admin"].put(f"/api/transport/assignments/{sid}", json={"route_id": rid, "stop": "Miyapur"}).status_code == 200
    # changing stop replaces, not duplicates
    assert x["admin"].put(f"/api/transport/assignments/{sid}", json={"route_id": rid, "stop": "Kukatpally", "mode": "pickup"}).status_code == 200
    rows = x["admin"].get("/api/transport/assignments").json()
    assert len(rows) == 1 and rows[0]["stop"] == "Kukatpally" and rows[0]["mode"] == "pickup"
    assert x["admin"].get("/api/transport/routes").json()[0]["students"] == 1
    assert x["admin"].get("/api/transport/buses").json()[0]["students"] == 1


def test_delete_guards(server, new_client):
    x = _setup(server, new_client)
    sid, rid = x["kid"]["id"], x["route"]["id"]
    x["admin"].put(f"/api/transport/assignments/{sid}", json={"route_id": rid, "stop": "Miyapur"})
    assert x["admin"].delete(f"/api/transport/buses/{x['bus']['id']}").status_code == 409     # used by a route
    assert x["admin"].delete(f"/api/transport/routes/{rid}").status_code == 409               # has students
    # can't drop a stop that students use
    r = x["admin"].put(f"/api/transport/routes/{rid}", json={"name": "Route A", "bus_id": x["bus"]["id"], "stops": [{"name": "Kukatpally"}]})
    assert r.status_code == 409 and "Miyapur" in r.json()["detail"]
    assert x["admin"].delete(f"/api/transport/assignments/{sid}").status_code == 200
    assert x["admin"].delete(f"/api/transport/routes/{rid}").status_code == 200
    assert x["admin"].delete(f"/api/transport/buses/{x['bus']['id']}").status_code == 200


def test_parent_sees_only_own_childs_bus(server, new_client):
    x = _setup(server, new_client)
    rid = x["route"]["id"]
    x["admin"].put(f"/api/transport/assignments/{x['kid']['id']}", json={"route_id": rid, "stop": "Miyapur"})
    t = x["mom"].get("/api/parent/overview").json()["children"][0]["transport"]
    assert t["bus_number"] == "Bus 7" and t["stop"] == "Miyapur" and t["pickup_time"] == "07:30" and t["drop_time"] == "16:25"
    assert t["driver_name"] == "Ramesh" and t["driver_phone"] == "98450 11111" and t["route_name"] == "Route A"
    assert x["other"].get("/api/parent/overview").json()["children"][0]["transport"] is None
