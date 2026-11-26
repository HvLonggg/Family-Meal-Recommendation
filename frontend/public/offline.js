// Trang ngoại tuyến: CSP `script-src 'self'` chặn onclick inline nên gắn sự kiện ở tệp riêng.
// SW trả trang này thay cho trang đang mở khi mất mạng: tải lại đúng địa chỉ đó; nếu đang mở
// trực tiếp /offline.html thì về trang chủ.
document.getElementById('retry')?.addEventListener('click', () => {
  if (window.location.pathname === '/offline.html') window.location.assign('/');
  else window.location.reload();
});
