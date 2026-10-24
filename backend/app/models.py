from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .config import get_settings

Role = Literal["admin", "teacher", "parent"]
StaffRole = Literal["admin", "teacher", "parent"]
PASSWORD_MIN = 8


# --- Auth ---
class LoginIn(BaseModel):
    school_code: str = Field(min_length=3, max_length=30)
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)

    @field_validator("school_code")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


class PlatformLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=200)


# --- School signup ---
class SchoolSignupIn(BaseModel):
    school_name: str = Field(min_length=2, max_length=120)
    school_code: str = Field(min_length=3, max_length=30)
    admin_name: str = Field(min_length=1, max_length=120)
    admin_email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=30)

    @field_validator("school_code")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.strip().lower()


# --- Users (staff & parents) managed by school admin ---
class UserCreateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    role: StaffRole
    password: str = Field(min_length=PASSWORD_MIN, max_length=200)


class UserUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    role: Optional[StaffRole] = None
    active: Optional[bool] = None


class ResetPasswordIn(BaseModel):
    new_password: str = Field(min_length=PASSWORD_MIN, max_length=200)


# --- School data ---
class Grade(BaseModel):
    model_config = ConfigDict(extra="ignore")
    subject: str = Field(max_length=100)
    term: str = Field(max_length=100)
    score: float
    max_score: float = 100


class StudentIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    date_of_birth: Optional[str] = None
    gender: Optional[Literal["male", "female", "other"]] = None
    photo_base64: Optional[str] = None
    joining_date: str
    leaving_date: Optional[str] = None
    class_id: Optional[str] = None
    roll_number: Optional[str] = Field(default=None, max_length=50)
    guardian_name: Optional[str] = Field(default=None, max_length=120)
    guardian_phone: Optional[str] = Field(default=None, max_length=30)
    guardian_email: Optional[EmailStr] = None
    address: Optional[str] = Field(default=None, max_length=500)
    notes: Optional[str] = Field(default=None, max_length=2000)
    grades: List[Grade] = []
    status: Literal["active", "left"] = "active"

    @field_validator("photo_base64")
    @classmethod
    def _photo_size(cls, v: Optional[str]) -> Optional[str]:
        if v and len(v) > get_settings().max_photo_bytes * 4 // 3 + 100:
            raise ValueError("Photo is too large (max 2 MB)")
        return v

    @field_validator("guardian_email")
    @classmethod
    def _lower_email(cls, v):
        return v.lower() if v else v


class ClassIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    section: Optional[str] = Field(default="", max_length=20)
    teacher_id: str = Field(min_length=1)                  # primary class teacher (required)
    secondary_teacher_id: Optional[str] = None             # optional second teacher
    attender_name: Optional[str] = Field(default=None, max_length=120)    # class attender / helper
    attender_phone: Optional[str] = Field(default=None, max_length=30)
    academic_year: Optional[str] = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _teachers_differ(self):
        if self.secondary_teacher_id and self.secondary_teacher_id == self.teacher_id:
            raise ValueError("The secondary teacher must be a different person from the primary teacher")
        return self


class FeeIn(BaseModel):
    student_id: str
    term: str = Field(min_length=1, max_length=100)
    amount: float = Field(ge=0)
    paid_amount: float = Field(default=0, ge=0)
    due_date: Optional[str] = None
    paid_date: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)


class AttendanceMark(BaseModel):
    student_id: str
    status: Literal["present", "absent", "late"]


class AttendanceBatchIn(BaseModel):
    date: str
    class_id: Optional[str] = None
    marks: List[AttendanceMark] = Field(max_length=2000)


# --- Billing / platform ---
class UpgradeRequestIn(BaseModel):
    plan: Literal["basic", "pro"]
    note: Optional[str] = Field(default=None, max_length=500)


class SchoolUpdateIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    status: Optional[Literal["active", "suspended"]] = None
    plan: Optional[Literal["trial", "basic", "pro"]] = None
    trial_ends_at: Optional[str] = None
    paid_until: Optional[str] = None
    clear_upgrade_request: Optional[bool] = None


# --- Class diary ---
class PostIn(BaseModel):
    class_id: str
    kind: Literal["classwork", "homework", "notice"]
    title: str = Field(min_length=1, max_length=150)
    body: Optional[str] = Field(default=None, max_length=2000)
    subject: Optional[str] = Field(default=None, max_length=60)
    due_date: Optional[str] = Field(default=None, max_length=10)   # homework only, YYYY-MM-DD
    date: Optional[str] = Field(default=None, max_length=10)       # the school day it is for, YYYY-MM-DD


class PostItem(BaseModel):
    title: str = Field(min_length=1, max_length=150)
    body: Optional[str] = Field(default=None, max_length=2000)
    subject: Optional[str] = Field(default=None, max_length=60)
    due_date: Optional[str] = Field(default=None, max_length=10)


class PostBatchIn(BaseModel):
    class_id: str
    kind: Literal["classwork", "homework", "notice"]
    date: Optional[str] = Field(default=None, max_length=10)
    items: List[PostItem] = Field(min_length=1, max_length=20)


# --- Letters / certificates ---
class SchoolProfileIn(BaseModel):
    address: Optional[str] = Field(default=None, max_length=300)
    phone: Optional[str] = Field(default=None, max_length=40)
    email: Optional[str] = Field(default=None, max_length=120)
    principal_name: Optional[str] = Field(default=None, max_length=120)
    affiliation: Optional[str] = Field(default=None, max_length=200)   # e.g. "CBSE affiliation no. 1234567"


class CertificateIn(BaseModel):
    student_id: str
    kind: Literal["bonafide", "fee_clearance", "transfer", "character"]
    purpose: Optional[str] = Field(default=None, max_length=200)       # bonafide: "for passport application"
    leaving_date: Optional[str] = Field(default=None, max_length=10)   # transfer
    reason: Optional[str] = Field(default=None, max_length=200)        # transfer: reason for leaving
    conduct: Optional[str] = Field(default=None, max_length=60)        # transfer / character
    remarks: Optional[str] = Field(default=None, max_length=300)
    ignore_dues: bool = False                                          # transfer with pending fees


# --- Transport ---
TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"


class BusIn(BaseModel):
    number: str = Field(min_length=1, max_length=30)               # what parents call it, e.g. "Bus 7"
    registration: Optional[str] = Field(default=None, max_length=30)
    capacity: int = Field(default=40, ge=1, le=200)
    driver_name: Optional[str] = Field(default=None, max_length=100)
    driver_phone: Optional[str] = Field(default=None, max_length=30)
    attendant_name: Optional[str] = Field(default=None, max_length=100)
    attendant_phone: Optional[str] = Field(default=None, max_length=30)


class StopIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    pickup_time: Optional[str] = Field(default=None, pattern=TIME_RE)   # morning, HH:MM
    drop_time: Optional[str] = Field(default=None, pattern=TIME_RE)     # evening, HH:MM


class RouteIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    bus_id: Optional[str] = None
    stops: List[StopIn] = Field(default=[], max_length=60)


class TransportAssignIn(BaseModel):
    route_id: str
    stop: str = Field(min_length=1, max_length=100)
    mode: Literal["both", "pickup", "drop"] = "both"


# --- Holidays & calendar ---
class HolidayIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end_date: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")   # for multi-day breaks


# --- Progress reports ---
class MarkIn(BaseModel):
    subject: str = Field(min_length=1, max_length=100)
    score: Optional[float] = Field(default=None, ge=0)
    max_score: float = Field(default=100, gt=0, le=1000)


class ReportEntryIn(BaseModel):
    student_id: str
    marks: List[MarkIn] = Field(default=[], max_length=20)
    remark: Optional[str] = Field(default=None, max_length=500)


class ReportBatchIn(BaseModel):
    class_id: str
    term: str = Field(min_length=1, max_length=100)
    entries: List[ReportEntryIn] = Field(max_length=300)
