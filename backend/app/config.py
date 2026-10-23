"""Application settings, read from environment variables (and backend/.env)."""
import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

_DEFAULT_SECRET = "local-dev-secret-change-me"


def _bool(name: str, default: bool) -> bool:
    val = os.environ.get(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


class Settings:
    def __init__(self) -> None:
        self.env = os.environ.get("ENV", "development").lower()
        self.is_production = self.env == "production"

        self.mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
        # Platform-wide data (schools, super admins) lives here; each school gets its own DB.
        self.platform_db = os.environ.get("PLATFORM_DB", "scholaris_platform")
        self.tenant_db_prefix = os.environ.get("TENANT_DB_PREFIX", "school_")

        self.jwt_secret = os.environ.get("JWT_SECRET", _DEFAULT_SECRET)
        self.access_ttl_minutes = int(os.environ.get("ACCESS_TOKEN_MINUTES", "60"))
        self.refresh_ttl_days = int(os.environ.get("REFRESH_TOKEN_DAYS", "7"))

        self.cookie_secure = _bool("COOKIE_SECURE", self.is_production)
        self.cookie_samesite = os.environ.get("COOKIE_SAMESITE", "lax")

        self.cors_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]

        self.superadmin_email = os.environ.get("SUPERADMIN_EMAIL", "").strip().lower()
        self.superadmin_password = os.environ.get("SUPERADMIN_PASSWORD", "")

        self.trial_days = int(os.environ.get("TRIAL_DAYS", "14"))
        self.allow_signup = _bool("ALLOW_SIGNUP", True)
        # Creates a "demo" school (admin@school.com / admin123) for local development only.
        self.seed_demo = _bool("SEED_DEMO", not self.is_production)

        self.max_photo_bytes = int(os.environ.get("MAX_PHOTO_BYTES", str(2 * 1024 * 1024)))

        # --- Billing (Razorpay). Leave keys empty to run in manual-approval mode. ---
        self.razorpay_key_id = os.environ.get("RAZORPAY_KEY_ID", "").strip()
        self.razorpay_key_secret = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
        self.razorpay_webhook_secret = os.environ.get("RAZORPAY_WEBHOOK_SECRET", "").strip()
        # Razorpay plan ids, e.g. RAZORPAY_PLAN_BASIC_MONTHLY=plan_XXXX (create them with scripts/razorpay_setup.py)
        self.razorpay_plans = {
            (plan, interval): os.environ.get(f"RAZORPAY_PLAN_{plan.upper()}_{interval.upper()}", "").strip()
            for plan in ("basic", "pro") for interval in ("monthly", "yearly")
        }
        # Days a paid school keeps full access after a renewal date passes while payment is retried.
        self.grace_days = int(os.environ.get("GRACE_DAYS", "3"))
        self.billing_name = os.environ.get("BILLING_NAME", "Scholaris")

    @property
    def razorpay_enabled(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)

    def razorpay_plan_id(self, plan: str, interval: str) -> str:
        return self.razorpay_plans.get((plan, interval), "")

    def validate(self) -> None:
        problems = []
        if self.is_production:
            if self.jwt_secret == _DEFAULT_SECRET or len(self.jwt_secret) < 32:
                problems.append("JWT_SECRET must be set to a random string of at least 32 characters")
            if not self.cors_origins:
                problems.append("CORS_ORIGINS must list your site's origin(s)")
            if self.seed_demo:
                problems.append("SEED_DEMO must be false in production")
            if self.superadmin_email and len(self.superadmin_password) < 12:
                problems.append("SUPERADMIN_PASSWORD must be at least 12 characters")
            if self.razorpay_enabled:
                if not self.razorpay_webhook_secret:
                    problems.append("RAZORPAY_WEBHOOK_SECRET is required when Razorpay keys are set")
                if self.razorpay_key_id.startswith("rzp_test_"):
                    import logging
                    logging.getLogger("scholaris").warning("Razorpay TEST keys are configured in production")
        if problems:
            raise RuntimeError("Invalid production configuration:\n - " + "\n - ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()
