import hashlib
from datetime import datetime, timezone
import user_agents
from app.cache import get_async_redis
from app.models import User
from app.observability import get_logger
from app.services.email import send_email

logger = get_logger("device_security")


def get_device_fingerprint(user_agent_str: str, client_ip: str) -> str:
    """Generate a deterministic fingerprint hash from User-Agent and IP subnet."""
    ua_clean = user_agent_str.strip().lower()
    ip_subnet = ".".join(client_ip.split(".")[:3]) if "." in client_ip else client_ip
    raw = f"{ua_clean}:{ip_subnet}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def parse_user_agent_friendly(user_agent_str: str) -> str:
    """Parse User-Agent into a human-readable browser and OS description."""
    try:
        ua = user_agents.parse(user_agent_str)
        browser = ua.browser.family or "Unknown Browser"
        os = ua.os.family or "Unknown OS"
        return f"{browser} on {os}"
    except Exception:
        return "Unknown Browser/Device"


async def check_and_notify_new_device(user: User, user_agent_str: str, client_ip: str) -> bool:
    """Check if device is new for the user. If new, store in Redis and send security email alert."""
    if not user_agent_str or not client_ip:
        return False

    redis_client = get_async_redis()
    device_hash = get_device_fingerprint(user_agent_str, client_ip)
    redis_key = f"user:{user.id}:known_devices"

    try:
        is_known = await redis_client.sismember(redis_key, device_hash)
        if is_known:
            return False

        # Add new device hash to Redis set
        await redis_client.sadd(redis_key, device_hash)
        # Set 90-day expiry on key
        await redis_client.expire(redis_key, 90 * 86400)

        device_desc = parse_user_agent_friendly(user_agent_str)
        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

        logger.info("new_device_login_detected", user_id=str(user.id), device=device_desc, ip=client_ip)

        # Send security email alert if user has email configured
        try:
            subject = "🔒 Security Alert: New Device Login to Your CODITENT Account"
            html_content = f"""
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
                <h2 style="color: #2563eb;">New Login Detected</h2>
                <p>Hello <strong>{user.full_name}</strong>,</p>
                <p>We detected a new login to your CODITENT account from an unrecognized device or location:</p>
                <ul style="background-color: #f8fafc; padding: 15px 25px; border-radius: 6px; list-style-type: none;">
                    <li><strong>Device / Browser:</strong> {device_desc}</li>
                    <li><strong>IP Address:</strong> {client_ip}</li>
                    <li><strong>Time:</strong> {now_str}</li>
                </ul>
                <p>If this was you, no action is needed.</p>
                <p style="color: #dc2626; font-weight: bold;">If you did NOT perform this login, please log in immediately and use the "Log Out All Devices" button in your account settings to protect your account.</p>
                <br>
                <p>Best regards,<br>The CODITENT Security Team</p>
            </div>
            """
            send_email(to_email=user.email, subject=subject, html=html_content)
        except Exception as exc:
            logger.warning("new_device_email_failed", user_id=str(user.id), error=str(exc))

        return True
    except Exception as exc:
        logger.error("device_security_check_error", user_id=str(user.id), error=str(exc))
        return False
