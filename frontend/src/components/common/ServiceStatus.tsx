import { useQuery } from '@tanstack/react-query';

import { ApiError, apiRequest } from '@/lib/api/client';

interface HealthResponse {
  data: {
    service: 'api';
    status: 'ok';
  };
}

export function ServiceStatus() {
  const healthQuery = useQuery({
    queryKey: ['health', 'livez'],
    queryFn: () => apiRequest<HealthResponse>('/livez'),
  });

  if (healthQuery.isPending) {
    return <div className="status status--loading">Đang kiểm tra kết nối API...</div>;
  }

  if (healthQuery.isError) {
    const message =
      healthQuery.error instanceof ApiError
        ? healthQuery.error.message
        : 'Không thể kết nối API. Hãy kiểm tra backend.';

    return (
      <div className="status status--error" role="alert">
        {message}
      </div>
    );
  }

  return (
    <div className="status status--success">
      <span className="status__dot" aria-hidden="true" />
      Nền tảng API đã sẵn sàng
    </div>
  );
}
