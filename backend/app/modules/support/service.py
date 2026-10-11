from uuid import UUID


def ticket_reference(ticket_id: UUID | str) -> str:
    return f"BV-{str(ticket_id).replace('-', '')[:8].upper()}"
