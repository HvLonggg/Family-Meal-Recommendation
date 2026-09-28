import argparse
from getpass import getpass

from sqlalchemy import select

from app.db.session import SessionLocal
from app.modules.auth.models import AuthIdentity, User
from app.modules.auth.security import hash_password


def create_or_update_admin(*, email: str, full_name: str, password: str) -> User:
    normalized_email = email.strip().casefold()
    with SessionLocal() as session:
        user = session.scalar(select(User).where(User.email == normalized_email))
        if user is None:
            user = User(
                email=normalized_email,
                full_name=full_name.strip(),
                password_hash=hash_password(password),
                role="admin",
                status="active",
            )
            session.add(user)
            session.flush()
            session.add(
                AuthIdentity(
                    user_id=user.id,
                    provider="password",
                    provider_subject=normalized_email,
                    provider_email=normalized_email,
                )
            )
        else:
            user.full_name = full_name.strip()
            user.password_hash = hash_password(password)
            user.role = "admin"
            user.status = "active"
        session.commit()
        session.refresh(user)
        return user


def main() -> None:
    parser = argparse.ArgumentParser(description="Tạo hoặc cập nhật quản trị viên Bếp Việt.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--name", default="Quản trị viên Bếp Việt")
    parser.add_argument("--password")
    args = parser.parse_args()
    password = args.password or getpass("Mật khẩu quản trị viên: ")
    user = create_or_update_admin(email=args.email, full_name=args.name, password=password)
    print(f"Đã sẵn sàng tài khoản admin: {user.email}")


if __name__ == "__main__":
    main()
