import type { LegalDocumentContent } from '@/pages/legal/legalTypes';

export const termsVi: LegalDocumentContent = {
  title: 'Điều khoản sử dụng',
  summary:
    'Thỏa thuận giữa bạn và Hoàng Văn Long (cá nhân vận hành Bếp Việt) khi sử dụng website và ứng dụng Bếp Việt. Việc xử lý dữ liệu cá nhân được trình bày tại Chính sách quyền riêng tư.',
  effectiveLabel: 'Ngày hiệu lực',
  updatedLabel: 'Cập nhật lần cuối',
  versionLabel: 'Phiên bản',
  tocLabel: 'Mục lục',
  sections: [
    {
      id: 'pham-vi',
      title: '1. Chấp nhận Điều khoản',
      blocks: [
        'Bếp Việt cung cấp công thức món Việt, gợi ý mâm cơm, kế hoạch bữa ăn, nhật ký nấu, cộng đồng chia sẻ và trợ lý Chú Rồng. Dịch vụ hiện miễn phí và có thể được điều chỉnh hoặc tạm ngừng từng phần để bảo trì.',
        'Khi tạo tài khoản hoặc xác nhận trong ứng dụng, bạn đồng ý với Điều khoản này; các quyền bắt buộc theo pháp luật của bạn luôn được bảo lưu.',
      ],
    },
    {
      id: 'tai-khoan',
      title: '2. Tài khoản và bảo mật',
      blocks: [
        {
          list: [
            'Bạn cần từ đủ 16 tuổi, hoặc có sự đồng ý và giám sát của cha, mẹ hoặc người giám hộ.',
            'Bạn cung cấp thông tin chính xác, giữ bí mật mật khẩu, chịu trách nhiệm về hoạt động trên tài khoản và báo ngay cho chúng tôi nếu nghi ngờ bị truy cập trái phép; không mua bán, chuyển nhượng tài khoản.',
            'Bạn có thể xóa tài khoản bất cứ lúc nào tại Tài khoản › Bảo mật.',
          ],
        },
      ],
    },
    {
      id: 'hanh-vi-cam',
      title: '3. Quy tắc sử dụng',
      blocks: [
        'Khi sử dụng Bếp Việt, bạn không được:',
        {
          list: [
            'Đăng nội dung trái pháp luật, xúc phạm, quấy rối, phân biệt đối xử, khiêu dâm, bạo lực hoặc xâm phạm quyền của người khác.',
            'Đăng hướng dẫn chế biến nguy hiểm hoặc thông tin sai lệch về sức khỏe.',
            'Quảng cáo trái phép, spam, lừa đảo hoặc mạo danh người, tổ chức khác.',
            'Tấn công, dò quét, vượt cơ chế bảo mật hoặc thu thập dữ liệu tự động khi chưa được cho phép.',
            'Cố ý khiến trợ lý tạo nội dung có hại hoặc sử dụng trợ lý cho mục đích trái pháp luật.',
          ],
        },
      ],
    },
    {
      id: 'noi-dung-nguoi-dung',
      title: '4. Nội dung của bạn',
      blocks: [
        'Bạn giữ quyền sở hữu nội dung mình gửi và bảo đảm có quyền đăng tải, ghi nguồn khi tham khảo. Khi đăng, bạn cấp cho Bếp Việt quyền không độc quyền, miễn phí, trên phạm vi toàn cầu để lưu trữ, hiển thị, biên tập và phân phối nội dung đó trong dịch vụ. Quyền này chấm dứt khi bạn xóa nội dung, trừ phần đã được biên tập vào kho công thức chung.',
        'Nội dung được kiểm duyệt trước khi xuất bản; chúng tôi có thể từ chối, yêu cầu chỉnh sửa, ẩn hoặc gỡ nội dung vi phạm. Sau khi bạn xóa tài khoản, bài viết đã xuất bản có thể tiếp tục hiển thị ở dạng ẩn danh trừ khi bạn xóa bài trước hoặc yêu cầu gỡ.',
      ],
    },
    {
      id: 'so-huu-tri-tue',
      title: '5. Sở hữu trí tuệ',
      blocks: [
        'Giao diện, thương hiệu, logo, mã nguồn và nội dung do Bếp Việt biên soạn thuộc quyền của Hoàng Văn Long hoặc bên cấp phép; bạn chỉ được sử dụng cho mục đích cá nhân, phi thương mại, trừ khi được cho phép. Hình ảnh món ăn có thể mang tính minh họa.',
        'Nếu cho rằng nội dung trên Bếp Việt xâm phạm quyền của mình, hãy gửi đường dẫn và căn cứ chứng minh tới hvlongg@gmail.com; chúng tôi sẽ xem xét và gỡ bỏ khi có cơ sở.',
      ],
    },
    {
      id: 'tro-ly-ai',
      title: '6. Trợ lý Chú Rồng và nội dung AI',
      blocks: [
        'Câu trả lời của Chú Rồng được trí tuệ nhân tạo tạo tự động, chỉ mang tính tham khảo cho việc nấu ăn hằng ngày và có thể sai, thiếu hoặc không phù hợp với hoàn cảnh của bạn. Nội dung AI không phải tư vấn y tế, dinh dưỡng, pháp lý hay tài chính và không thay thế ý kiến chuyên gia.',
      ],
    },
    {
      id: 'an-toan-thuc-pham',
      title: '7. An toàn thực phẩm và dị ứng',
      blocks: [
        'Hãy tự kiểm tra thành phần nếu bạn có dị ứng, bệnh lý, đang mang thai, cho con bú hoặc nấu cho trẻ nhỏ, người cao tuổi. Thông tin dị ứng trong hồ sơ giúp gợi ý phù hợp hơn nhưng không bảo đảm loại trừ hoàn toàn chất gây dị ứng; khẩu phần và dinh dưỡng chỉ là ước tính.',
        'Hãy tuân thủ nguyên tắc an toàn thực phẩm: nấu chín kỹ thịt, cá, trứng; bảo quản đúng nhiệt độ; cẩn thận với dao, lửa và dầu nóng.',
      ],
    },
    {
      id: 'mien-tru',
      title: '8. Giới hạn trách nhiệm',
      blocks: [
        'Dịch vụ được cung cấp theo hiện trạng; chúng tôi không bảo đảm dịch vụ luôn liên tục, không có lỗi.',
        'Trong phạm vi pháp luật cho phép, chúng tôi không chịu trách nhiệm về thiệt hại gián tiếp phát sinh từ việc làm theo công thức, nội dung người dùng hoặc câu trả lời AI, kể cả dị ứng hay ngộ độc do nguyên liệu, chế biến, bảo quản ngoài kiểm soát của chúng tôi. Điều này không loại trừ trách nhiệm mà pháp luật Việt Nam không cho phép loại trừ, kể cả quyền của người tiêu dùng.',
      ],
    },
    {
      id: 'cham-dut',
      title: '9. Tạm khóa và chấm dứt',
      blocks: [
        'Bạn có thể ngừng sử dụng và xóa tài khoản bất cứ lúc nào. Chúng tôi có thể tạm khóa hoặc chấm dứt tài khoản vi phạm nghiêm trọng hoặc lặp lại, theo yêu cầu của cơ quan có thẩm quyền, hoặc khi ngừng cung cấp dịch vụ; trường hợp ngừng dịch vụ, chúng tôi sẽ thông báo trước một thời gian hợp lý để bạn tải dữ liệu.',
      ],
    },
    {
      id: 'thay-doi',
      title: '10. Thay đổi Điều khoản',
      blocks: [
        'Chúng tôi có thể cập nhật Điều khoản; phiên bản và ngày cập nhật ghi ở đầu trang. Thay đổi quan trọng được thông báo trong ứng dụng hoặc qua email; nếu không đồng ý, bạn có thể ngừng sử dụng và xóa tài khoản.',
      ],
    },
    {
      id: 'luat-ap-dung',
      title: '11. Luật áp dụng và giải quyết tranh chấp',
      blocks: [
        'Điều khoản được điều chỉnh bởi pháp luật nước Cộng hòa xã hội chủ nghĩa Việt Nam. Tranh chấp ưu tiên giải quyết bằng thương lượng; nếu không thành, một bên có thể đưa ra Tòa án nhân dân có thẩm quyền. Bản tiếng Việt được ưu tiên áp dụng khi có khác biệt với bản dịch.',
      ],
    },
    {
      id: 'lien-he',
      title: '12. Liên hệ',
      blocks: [
        'Hoàng Văn Long (cá nhân vận hành Bếp Việt) — 80/57 Mễ Trì Hạ, Từ Liêm, Hà Nội — hvlongg@gmail.com. Bạn cũng có thể gửi yêu cầu qua trang Liên hệ hỗ trợ trong ứng dụng.',
      ],
    },
  ],
};

export const termsEn: LegalDocumentContent = {
  title: 'Terms of Use',
  summary:
    'These Terms are an agreement between you and Hoang Van Long (individual operator of Bep Viet) for using the Bep Viet website and app. How we handle personal data is set out separately in the Privacy Policy. The Vietnamese version prevails if the two versions differ.',
  effectiveLabel: 'Effective date',
  updatedLabel: 'Last updated',
  versionLabel: 'Version',
  tocLabel: 'Contents',
  sections: [
    {
      id: 'pham-vi',
      title: '1. Acceptance of these Terms',
      blocks: [
        'Bep Viet offers Vietnamese recipes, family meal suggestions, meal planning, a cooking log, a community and the Chú Rồng assistant. The service is currently free and may be adjusted or partly suspended for maintenance.',
        'By creating an account or confirming in the app, you agree to these Terms; your mandatory statutory rights remain unaffected.',
      ],
    },
    {
      id: 'tai-khoan',
      title: '2. Account and security',
      blocks: [
        {
          list: [
            'You must be 16 or older, or have the consent and supervision of a parent or guardian.',
            'Provide accurate information, keep your password secret, take responsibility for activity on your account and tell us promptly if you suspect unauthorised access; do not sell or transfer accounts.',
            'You can delete your account at any time under Account › Security.',
          ],
        },
      ],
    },
    {
      id: 'hanh-vi-cam',
      title: '3. Acceptable use',
      blocks: [
        'When using Bep Viet, you must not:',
        {
          list: [
            'Post unlawful, abusive, harassing, discriminatory, sexual or violent content, or content infringing the rights of others.',
            'Post dangerous cooking instructions or health misinformation.',
            'Send unauthorised advertising or spam, commit fraud or impersonate people or organisations.',
            'Attack, scan or bypass security, or scrape data automatically without permission.',
            'Deliberately make the assistant produce harmful content or use it for unlawful purposes.',
          ],
        },
      ],
    },
    {
      id: 'noi-dung-nguoi-dung',
      title: '4. Your content',
      blocks: [
        'You keep ownership of the content you submit and confirm that you have the right to post it and credit your sources. By posting, you grant Bep Viet a non-exclusive, royalty-free, worldwide licence to store, display, edit and distribute that content within the service. The licence ends when you delete the content, except for material already edited into the shared recipe library.',
        'Content is moderated before publication; we may reject, request changes to, hide or remove content in breach. After you delete your account, published stories may remain visible anonymously unless you delete them first or ask us to remove them.',
      ],
    },
    {
      id: 'so-huu-tri-tue',
      title: '5. Intellectual property',
      blocks: [
        'The interface, brand, logo, source code and content written by Bep Viet belong to Hoang Van Long or its licensors; unless permitted, you may use them only for personal, non-commercial purposes. Dish images may be illustrations.',
        'If you believe content on Bep Viet infringes your rights, send the link and supporting proof to hvlongg@gmail.com; we will review it and remove the content where justified.',
      ],
    },
    {
      id: 'tro-ly-ai',
      title: '6. Chú Rồng assistant and AI content',
      blocks: [
        'Chú Rồng replies are generated automatically by artificial intelligence, are a reference for everyday cooking only and may be wrong, incomplete or unsuitable for your situation. AI content is not medical, nutrition, legal or financial advice and does not replace professional opinion.',
      ],
    },
    {
      id: 'an-toan-thuc-pham',
      title: '7. Food safety and allergies',
      blocks: [
        'Check ingredients yourself if you have allergies or medical conditions, are pregnant or breastfeeding, or cook for young children or older people. Allergy details in your profile improve suggestions but cannot guarantee that allergens are excluded; portions and nutrition are estimates.',
        'Follow food safety basics: cook meat, fish and eggs thoroughly; store food at the right temperature; take care with knives, flames and hot oil.',
      ],
    },
    {
      id: 'mien-tru',
      title: '8. Limitation of liability',
      blocks: [
        'The service is provided "as is"; we do not guarantee uninterrupted or error-free service.',
        'To the extent permitted by law, we are not liable for indirect damage arising from following recipes, user content or AI replies, including allergies or food poisoning caused by ingredients, preparation or storage outside our control. This does not exclude liability that cannot be excluded under Vietnamese law, including consumer rights.',
      ],
    },
    {
      id: 'cham-dut',
      title: '9. Suspension and termination',
      blocks: [
        'You can stop using the service and delete your account at any time. We may suspend or terminate accounts for serious or repeated breaches, at the request of competent authorities, or if we discontinue the service; in that case we will give reasonable prior notice so you can download your data.',
      ],
    },
    {
      id: 'thay-doi',
      title: '10. Changes to these Terms',
      blocks: [
        'We may update these Terms; the version and update date appear at the top of the page. Significant changes will be announced in the app or by email. If you disagree, you may stop using the service and delete your account.',
      ],
    },
    {
      id: 'luat-ap-dung',
      title: '11. Governing law and disputes',
      blocks: [
        'These Terms are governed by the laws of the Socialist Republic of Vietnam. Disputes are first resolved by negotiation; failing that, either party may bring the dispute before a competent People’s Court in Vietnam. The Vietnamese version prevails over translations.',
      ],
    },
    {
      id: 'lien-he',
      title: '12. Contact',
      blocks: [
        'Hoang Van Long (individual operator of Bep Viet) — 80/57 Me Tri Ha, Tu Liem, Hanoi, Vietnam — hvlongg@gmail.com. You can also send requests via the Contact support page in the app.',
      ],
    },
  ],
};
