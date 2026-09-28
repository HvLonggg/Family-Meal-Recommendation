export function SubmitRecipePage() {
  return (
    <div className="page-wrap">
      <section className="page-hero">
        <div className="container">
          <span className="section-label">Cộng đồng Bếp Việt</span>
          <h1>Đề xuất món nhà bạn yêu thích</h1>
          <p>
            Chia sẻ tên món, câu chuyện và công thức. Ban nội dung sẽ kiểm tra trước khi xuất bản.
          </p>
        </div>
      </section>
      <section className="content-section">
        <div className="container submission-layout">
          <form className="submission-form">
            <label>
              <span>Tên món ăn *</span>
              <input placeholder="Ví dụ: Thịt kho trứng của mẹ" required />
            </label>
            <div className="form-row">
              <label>
                <span>Vùng miền</span>
                <select>
                  <option>Ba miền</option>
                  <option>Bắc</option>
                  <option>Trung</option>
                  <option>Nam</option>
                </select>
              </label>
              <label>
                <span>Khẩu phần</span>
                <input min="1" type="number" defaultValue="4" />
              </label>
            </div>
            <label>
              <span>Câu chuyện hoặc mô tả ngắn *</span>
              <textarea
                placeholder="Điều gì khiến món này đặc biệt với gia đình bạn?"
                rows={4}
                required
              />
            </label>
            <label>
              <span>Nguyên liệu chính *</span>
              <textarea
                placeholder="Mỗi nguyên liệu một dòng, ghi rõ số lượng và đơn vị"
                rows={6}
                required
              />
            </label>
            <label>
              <span>Các bước thực hiện *</span>
              <textarea
                placeholder="Mỗi bước một dòng, thêm thời gian hoặc dấu hiệu món đạt nếu có"
                rows={7}
                required
              />
            </label>
            <button className="button button--primary" type="button">
              Lưu bản nháp
            </button>
          </form>
          <aside className="submission-guide">
            <h3>Một đề xuất tốt nên có</h3>
            <ol>
              <li>Tên món rõ ràng, đúng cách gọi quen thuộc.</li>
              <li>Định lượng và đơn vị cụ thể cho khẩu phần gốc.</li>
              <li>Tách riêng sơ chế và quá trình nấu.</li>
              <li>Ảnh tự chụp, đủ sáng và không có watermark.</li>
            </ol>
            <p>Nội dung gửi lên chưa tự động hiển thị công khai.</p>
          </aside>
        </div>
      </section>
    </div>
  );
}
