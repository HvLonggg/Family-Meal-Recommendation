/**
 * Thông tin liên hệ chính thức của Bếp Việt.
 * Email, số điện thoại và Zalo có giá trị mặc định; có thể ghi đè qua biến môi trường.
 * Địa chỉ có giá trị mặc định nhưng vẫn ghi đè được
 * qua biến môi trường để không phải sửa mã.
 */
const DEFAULT_ADDRESS = 'Ngõ 80/57 Mễ Trì Hạ, phường Từ Liêm, Hà Nội';
// Giữ tên quận cũ riêng cho truy vấn Google Maps.
const DEFAULT_MAP_QUERY = '80/57 Mễ Trì Hạ, Nam Từ Liêm, Hà Nội';

export const contactInfo = {
  ownerName: 'Hoàng Văn Long',
  ownerRole: 'Nhà sáng lập & phụ trách sản phẩm',
  email: import.meta.env.VITE_CONTACT_EMAIL?.trim() || 'hvlongg@gmail.com',
  phone: import.meta.env.VITE_CONTACT_PHONE?.trim() || '0364892903',
  zalo: import.meta.env.VITE_CONTACT_ZALO?.trim() || null,
  address: import.meta.env.VITE_CONTACT_ADDRESS?.trim() || DEFAULT_ADDRESS,
  mapQuery:
    import.meta.env.VITE_CONTACT_MAP_QUERY?.trim() ||
    import.meta.env.VITE_CONTACT_ADDRESS?.trim() ||
    DEFAULT_MAP_QUERY,
  workingHours: 'Thứ Hai – Thứ Sáu, 08:30 – 17:30 (GMT+7)',
  responseTime: 'Phản hồi trong 1–2 ngày làm việc',
};

export function phoneHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

/** Bản đồ tải chậm, không cần API key. */
export function mapEmbedUrl(query: string, language = 'vi') {
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&hl=${language}&z=16&output=embed`;
}

export function mapLinkUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
