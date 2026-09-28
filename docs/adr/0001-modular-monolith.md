# ADR 0001 Kiến trúc modular monolith

Status: Accepted  
Date: 27/09/2026  
Owner: Technical Lead

## Context

Bếp Việt đang ở giai đoạn MVP, cần triển khai nhanh nhưng vẫn giữ boundary rõ giữa recipe, ingredient, meal set, planner, favorite, admin, feedback và audit. Microservice làm tăng chi phí triển khai, quan sát và giao tiếp khi chưa có dữ liệu tải thực tế.

## Decision

Backend bắt đầu bằng một deployable FastAPI theo kiến trúc modular monolith. Router chỉ xử lý HTTP, service điều phối nghiệp vụ, repository truy cập dữ liệu và module chỉ sử dụng public interface của nhau.

Frontend tổ chức theo feature boundary và dùng một deployable React web app.

## Alternatives considered

- Microservice theo từng domain.
- Một codebase không có module boundary.

## Consequences

- Triển khai và debug đơn giản hơn.
- Transaction xuyên các module lõi dễ kiểm soát hơn.
- Team phải duy trì boundary bằng review và test thay vì dựa vào network boundary.
- Chỉ tách service khi có số liệu tải, ownership hoặc lifecycle deployment chứng minh nhu cầu.

## Security impact

RBAC và user scope vẫn phải enforce tại service hoặc permission layer của từng module. Modular monolith không cho phép module bỏ qua authorization.

## Migration impact

Không có migration dữ liệu tại thời điểm chấp nhận ADR.

## Rollback plan

Không áp dụng. Nếu cần tách service, tạo ADR mới và migration plan cho contract và dữ liệu.
