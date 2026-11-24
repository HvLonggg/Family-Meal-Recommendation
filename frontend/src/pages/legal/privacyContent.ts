import type { LegalDocumentContent } from '@/pages/legal/legalTypes';

/*
 * Nội dung bám theo dữ liệu ứng dụng thực sự xử lý (models backend, localStorage frontend,
 * nhà cung cấp trong docs/DEPLOYMENT.md). Khi thêm loại dữ liệu hoặc nhà cung cấp mới,
 * cập nhật cả hai bản ngôn ngữ và tăng LEGAL_VERSION.
 */
export const privacyVi: LegalDocumentContent = {
  title: 'Chính sách quyền riêng tư',
  summary:
    'Chính sách này giải thích Bếp Việt thu thập dữ liệu cá nhân nào khi bạn dùng website và ứng dụng (PWA), dùng để làm gì, chia sẻ với ai, lưu trong bao lâu và bạn có những quyền gì.',
  effectiveLabel: 'Ngày hiệu lực',
  versionLabel: 'Phiên bản',
  tocLabel: 'Mục lục',
  sections: [
    {
      id: 'ben-kiem-soat',
      title: '1. Ai chịu trách nhiệm về dữ liệu của bạn',
      blocks: [
        'Bên kiểm soát và xử lý dữ liệu cá nhân là Hoàng Văn Long (cá nhân vận hành Bếp Việt), địa chỉ 80/57 Mễ Trì Hạ, Từ Liêm, Hà Nội ("Bếp Việt", "chúng tôi").',
        'Đầu mối bảo vệ dữ liệu cá nhân: Hoàng Văn Long, điện thoại 0364892903, email hvlongg@gmail.com.',
        'Chính sách này được áp dụng cùng Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và các văn bản hướng dẫn hiện hành của Việt Nam. Các quyền bắt buộc theo pháp luật của bạn được bảo lưu.',
      ],
    },
    {
      id: 'du-lieu-thu-thap',
      title: '2. Dữ liệu chúng tôi thu thập',
      blocks: [
        'Chúng tôi chỉ thu thập dữ liệu cần cho tính năng bạn sử dụng:',
        {
          list: [
            'Tài khoản: họ tên, địa chỉ email, mật khẩu (chỉ lưu dạng băm, không lưu bản gốc), ảnh đại diện nếu bạn tải lên, vai trò, ngày tạo và lần đăng nhập gần nhất.',
            'Đăng nhập bằng Google hoặc Facebook (nếu dùng): mã định danh tài khoản và email do nhà cung cấp trả về. Chúng tôi không nhận mật khẩu của các tài khoản này.',
            'Cài đặt và hồ sơ bữa ăn: ngôn ngữ, mô tả và số thành viên trong gia đình (nhãn, độ tuổi, sức ăn), chế độ ăn, dị ứng hoặc thực phẩm cần tránh, mức cay, vùng miền yêu thích, thời gian nấu, lịch âm/dương, ngày ăn chay và lựa chọn nhận thông báo.',
            'Hoạt động trong ứng dụng: món yêu thích, kế hoạch bữa ăn và lịch sử thay đổi kế hoạch, mâm cơm đã lưu, nhật ký nấu (món, khẩu phần, thời gian, ghi chú), hẹn giờ khi nấu.',
            'Trợ lý Chú Rồng: nội dung bạn nhắn, tệp ảnh/PDF bạn đính kèm, câu trả lời của trợ lý và các "ghi nhớ" bạn cho phép lưu (ví dụ khẩu vị, dị ứng).',
            'Nội dung bạn đăng: bài viết cộng đồng, ảnh bìa, công thức đề xuất và câu chuyện kèm theo.',
            'Liên hệ hỗ trợ: tên, email, chủ đề và nội dung bạn gửi.',
            'Thông báo đẩy (nếu bạn bật): địa chỉ đăng ký và khóa mã hóa do trình duyệt cấp để gửi thông báo hẹn giờ.',
            'Dữ liệu kỹ thuật: phiên đăng nhập (mã làm mới lưu dạng băm, thời hạn), địa chỉ IP dùng để giới hạn tần suất thao tác (lưu dạng mã băm khi ghi vào cơ sở dữ liệu), nhật ký truy cập máy chủ (đường dẫn, mã kết quả, thời điểm) phục vụ vận hành và an ninh.',
          ],
        },
        'Dữ liệu cá nhân nhạy cảm: thông tin dị ứng, chế độ ăn vì lý do sức khỏe hoặc ngày ăn chay theo tín ngưỡng có thể được coi là dữ liệu nhạy cảm. Các trường này đều không bắt buộc; bạn chỉ nên nhập khi muốn nhận gợi ý phù hợp và có thể xóa bất cứ lúc nào trong Cài đặt. Bạn không nên gửi cho trợ lý số giấy tờ tùy thân, thông tin tài chính hay hồ sơ bệnh án.',
        'Chúng tôi không dùng công cụ phân tích hành vi hay quảng cáo của bên thứ ba và không bán dữ liệu cá nhân.',
      ],
    },
    {
      id: 'muc-dich',
      title: '3. Mục đích và cơ sở xử lý',
      blocks: [
        {
          list: [
            'Tạo và bảo vệ tài khoản, đăng nhập, khôi phục mật khẩu, đổi email (gửi mã xác thực qua email).',
            'Cung cấp tính năng chính: gợi ý món, kế hoạch bữa ăn, khẩu phần theo gia đình, nhật ký nấu, hẹn giờ và thông báo.',
            'Trả lời câu hỏi qua trợ lý Chú Rồng và ghi nhớ sở thích bạn đồng ý lưu.',
            'Hiển thị, kiểm duyệt nội dung cộng đồng; xử lý yêu cầu hỗ trợ.',
            'Gửi email cần thiết (bảo mật tài khoản, mã xác thực, nhắc kế hoạch nếu bạn bật).',
            'Bảo đảm an ninh: chống đoán mật khẩu, lạm dụng, gian lận; tuân thủ nghĩa vụ pháp lý.',
          ],
        },
        'Việc xử lý dựa trên sự đồng ý tự nguyện, rõ ràng cho mục đích được thông báo hoặc căn cứ khác được pháp luật cho phép. Việc chỉ truy cập website, im lặng hoặc chấp nhận điều khoản không tự động là đồng ý với mọi hoạt động xử lý. Bạn có thể rút lại sự đồng ý bằng cách liên hệ hỗ trợ; việc này không ảnh hưởng đến xử lý hợp pháp trước đó.',
        'Chúng tôi không dùng dữ liệu cá nhân cho mục đích khác với mục đích đã thông báo khi chưa hỏi lại ý kiến của bạn.',
      ],
    },
    {
      id: 'ben-thu-ba',
      title: '4. Bên xử lý dữ liệu và chuyển dữ liệu ra nước ngoài',
      blocks: [
        'Tùy cấu hình triển khai và tính năng bạn sử dụng, dịch vụ có thể sử dụng các nhà cung cấp sau. Chỉ dữ liệu cần thiết cho tính năng tương ứng được chuyển tới nhà cung cấp:',
        {
          list: [
            'Vercel Inc. (Hoa Kỳ): lưu trữ giao diện web và chuyển tiếp yêu cầu tới máy chủ.',
            'Render Services, Inc. (Hoa Kỳ): chạy máy chủ ứng dụng và lưu nhật ký vận hành.',
            'Neon (Databricks, Inc., Hoa Kỳ): cơ sở dữ liệu PostgreSQL khi được cấu hình.',
            'Google LLC (Hoa Kỳ): gửi email qua Gmail API; đăng nhập bằng Google (nếu dùng); Gemini API xử lý một phần hội thoại trợ lý và tạo vector tìm kiếm cho tài liệu tham khảo; bản đồ Google Maps nhúng ở chân trang.',
            'Anthropic PBC (Hoa Kỳ): mô hình Claude xử lý hội thoại trợ lý khi được cấu hình.',
            'Meta Platforms, Inc. (Hoa Kỳ): đăng nhập bằng Facebook (nếu dùng).',
            'Dịch vụ thông báo đẩy của trình duyệt bạn dùng (ví dụ Google, Mozilla, Apple): chuyển thông báo hẹn giờ tới thiết bị.',
          ],
        },
        'Khi bạn dùng trợ lý, nội dung tin nhắn, tệp đính kèm, một phần lịch sử hội thoại và hồ sơ bữa ăn liên quan (ví dụ dị ứng, khẩu phần) có thể được gửi tới nhà cung cấp AI để tạo câu trả lời. Một số câu hỏi được trả lời bằng mô hình nội bộ mà không gửi ra ngoài.',
        'Một số nhà cung cấp có thể xử lý dữ liệu ngoài Việt Nam. Địa điểm xử lý phụ thuộc dịch vụ được kích hoạt và cấu hình lưu trữ. Bạn có thể yêu cầu thông tin về bên nhận, mục đích và nơi xử lý qua hòm thư hỗ trợ. Việc chuyển dữ liệu phải đáp ứng điều kiện pháp luật và yêu cầu về sự đồng ý khi áp dụng; không được suy đoán sự đồng ý từ việc truy cập website.',
        'Chúng tôi chỉ cung cấp dữ liệu cho cơ quan nhà nước khi có yêu cầu hợp pháp theo quy định pháp luật.',
      ],
    },
    {
      id: 'luu-tru',
      title: '5. Thời hạn lưu trữ',
      blocks: [
        {
          list: [
            'Tài khoản, cài đặt, kế hoạch, yêu thích, nhật ký nấu, hội thoại và ghi nhớ: lưu cho đến khi bạn xóa từng mục hoặc xóa tài khoản.',
            'Phiên đăng nhập: hết hạn sau 12 giờ, hoặc theo thời hạn "Ghi nhớ thiết bị" (mặc định 30 ngày); bị thu hồi khi bạn đăng xuất, đổi mật khẩu hoặc đăng xuất mọi thiết bị.',
            'Mã xác thực email: chỉ dùng một lần và hết hạn sau vài phút.',
            'Hẹn giờ nấu: lưu đến khi chuông kêu hoặc bạn hủy, và bị xóa khi xóa tài khoản.',
            'Yêu cầu hỗ trợ: lưu trong thời gian cần thiết để xử lý yêu cầu, giải quyết tranh chấp và thực hiện nghĩa vụ pháp lý. Bạn có thể yêu cầu xem, xóa hoặc hạn chế xử lý qua hòm thư hỗ trợ.',
            'Bài viết cộng đồng đã xuất bản: tiếp tục hiển thị ở dạng ẩn danh sau khi tài khoản bị xóa, trừ khi bạn xóa bài trước hoặc yêu cầu gỡ.',
            'Bản sao lưu và nhật ký hệ thống: thời hạn phụ thuộc cấu hình hạ tầng và nhu cầu bảo mật. Dữ liệu chờ xóa khỏi bản sao lưu được hạn chế truy cập; nếu cần lưu theo luật hoặc phục vụ tranh chấp, chúng tôi thông báo lý do và phạm vi áp dụng khi xử lý yêu cầu của bạn.',
          ],
        },
      ],
    },
    {
      id: 'bao-mat',
      title: '6. Biện pháp bảo mật',
      blocks: [
        'Các biện pháp đang áp dụng:',
        {
          list: [
            'Mật khẩu được băm bằng thuật toán băm mật khẩu chuyên dụng (Argon2); hệ thống không lưu và không gửi lại mật khẩu gốc.',
            'Mã làm mới phiên được lưu dạng băm, gửi qua cookie HttpOnly, SameSite=Lax; mã truy cập chỉ nằm trong bộ nhớ trình duyệt và bị vô hiệu khi đổi mật khẩu.',
            'Mã xác thực email 5 chữ số, dùng một lần, có thời hạn, giới hạn số lần nhập sai và tần suất gửi lại.',
            'Giới hạn số lần đăng nhập sai theo email và theo địa chỉ IP.',
            'Kết nối được mã hóa HTTPS/TLS; dữ liệu của mỗi người dùng được truy vấn theo đúng tài khoản sở hữu.',
            'Chỉ quản trị viên được phân quyền mới truy cập trang quản trị, và chỉ trong phạm vi cần cho vận hành, hỗ trợ, kiểm duyệt.',
          ],
        },
        'Không có hệ thống nào an toàn tuyệt đối. Hãy dùng mật khẩu riêng, mạnh và đăng xuất trên thiết bị dùng chung.',
      ],
    },
    {
      id: 'luu-tru-cuc-bo',
      title: '7. Cookie và lưu trữ cục bộ',
      blocks: [
        'Bếp Việt không dùng cookie quảng cáo hay theo dõi. Chúng tôi dùng:',
        {
          list: [
            'Cookie phiên đăng nhập (HttpOnly) và cookie tạm khi đăng nhập bằng Google/Facebook: bắt buộc để đăng nhập an toàn.',
            'Bộ nhớ cục bộ (localStorage) của trình duyệt: ngôn ngữ, email gợi nhớ khi bạn chọn "Ghi nhớ thiết bị", tiến độ và hẹn giờ khi nấu, lịch sử vòng quay món, cài đặt đọc to, bản nháp và tín hiệu đăng xuất giữa các tab, trạng thái lời chào của trợ lý và hội thoại của khách chưa đăng nhập.',
            'Bộ nhớ đệm của ứng dụng (service worker): lưu tệp giao diện để ứng dụng mở nhanh và nhận thông báo.',
          ],
        },
        'Dữ liệu cục bộ chỉ nằm trên thiết bị của bạn. Bạn có thể xóa trong cài đặt trình duyệt; khi đó một số tiện ích (ghi nhớ email, tiến độ nấu) sẽ bị đặt lại. Bản đồ Google Maps nhúng ở chân trang có thể đặt cookie theo chính sách của Google.',
      ],
    },
    {
      id: 'quyen',
      title: '8. Quyền của bạn và cách thực hiện',
      blocks: [
        'Bạn có quyền được biết, đồng ý, truy cập, chỉnh sửa, xóa, hạn chế xử lý, nhận bản sao dữ liệu, phản đối xử lý, rút lại sự đồng ý, khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường theo quy định của pháp luật. Cách thực hiện:',
        {
          list: [
            'Truy cập và chỉnh sửa: xem, sửa hồ sơ, ảnh đại diện và cài đặt tại Tài khoản › Hồ sơ và Cài đặt.',
            'Nhận bản sao dữ liệu: Tài khoản › Cài đặt › "Tải dữ liệu của tôi" (tệp JSON).',
            'Xóa từng phần: xóa ghi nhớ của trợ lý, hội thoại, món yêu thích, kế hoạch, nhật ký nấu và bài viết ngay trong ứng dụng.',
            'Xóa tài khoản: Tài khoản › Bảo mật › "Xóa tài khoản". Thao tác xóa vĩnh viễn tài khoản cùng dữ liệu cá nhân nêu ở mục 2; bài viết đã xuất bản được giữ lại ở dạng ẩn danh.',
            'Rút lại sự đồng ý hoặc phản đối: tắt thông báo email/đẩy trong Cài đặt, ngừng dùng trợ lý, hoặc xóa tài khoản. Việc rút lại có thể khiến một số tính năng không còn hoạt động.',
            'Yêu cầu khác (hạn chế xử lý, gỡ bài, khiếu nại): gửi tới hvlongg@gmail.com hoặc trang Liên hệ hỗ trợ. Chúng tôi phản hồi trong thời hạn pháp luật quy định, mục tiêu trong vòng 15 ngày, và có thể cần xác minh bạn là chủ tài khoản.',
          ],
        },
      ],
    },
    {
      id: 'tre-em',
      title: '9. Trẻ em',
      blocks: [
        'Dịch vụ dành cho người từ đủ 16 tuổi trở lên. Trẻ em dưới 16 tuổi chỉ được dùng tài khoản khi cha, mẹ hoặc người giám hộ đã đồng ý và giám sát. Thông tin độ tuổi thành viên gia đình bạn nhập (ví dụ "Bé, 6 tuổi") chỉ dùng để tính khẩu phần.',
        'Nếu phát hiện tài khoản của trẻ em được tạo mà không có sự đồng ý của người giám hộ, vui lòng liên hệ để chúng tôi xóa.',
      ],
    },
    {
      id: 'vi-pham',
      title: '10. Thông báo khi có sự cố dữ liệu',
      blocks: [
        'Khi phát hiện sự cố vi phạm bảo vệ dữ liệu cá nhân, chúng tôi sẽ khắc phục, thông báo cho cơ quan chuyên trách bảo vệ dữ liệu cá nhân trong thời hạn pháp luật quy định (hiện là không quá 72 giờ kể từ khi phát hiện) và thông báo cho người dùng bị ảnh hưởng qua email hoặc trong ứng dụng khi sự cố có thể gây hại cho bạn.',
      ],
    },
    {
      id: 'thay-doi',
      title: '11. Thay đổi chính sách',
      blocks: [
        'Chúng tôi có thể cập nhật chính sách khi tính năng hoặc quy định thay đổi. Mỗi bản cập nhật có số phiên bản và ngày hiệu lực ở đầu trang. Với thay đổi quan trọng, chúng tôi thông báo trong ứng dụng hoặc qua email trước khi áp dụng và hỏi lại sự đồng ý khi pháp luật yêu cầu.',
      ],
    },
    {
      id: 'lien-he',
      title: '12. Liên hệ',
      blocks: [
        'Hoàng Văn Long (cá nhân vận hành Bếp Việt) — 80/57 Mễ Trì Hạ, Từ Liêm, Hà Nội.',
        'Email quyền riêng tư: hvlongg@gmail.com. Bạn cũng có thể gửi yêu cầu qua trang Liên hệ hỗ trợ trong ứng dụng.',
      ],
    },
  ],
};

export const privacyEn: LegalDocumentContent = {
  title: 'Privacy Policy',
  summary:
    'This policy explains what personal data Bep Viet collects when you use the website and app (PWA), why, who we share it with, how long we keep it and what rights you have. The Vietnamese version prevails if the two versions differ.',
  effectiveLabel: 'Effective date',
  versionLabel: 'Version',
  tocLabel: 'Contents',
  sections: [
    {
      id: 'ben-kiem-soat',
      title: '1. Who is responsible for your data',
      blocks: [
        'The data controller and processor is Hoang Van Long (individual operator of Bep Viet), contact address: 80/57 Me Tri Ha, Tu Liem, Hanoi, Vietnam ("Bep Viet", "we").',
        'Data protection contact: Hoang Van Long, phone +84 364 892 903, email hvlongg@gmail.com.',
        'This policy applies alongside Vietnam’s Law on Personal Data Protection No. 91/2025/QH15 and its current implementing regulations. Your mandatory statutory rights remain unaffected.',
      ],
    },
    {
      id: 'du-lieu-thu-thap',
      title: '2. Data we collect',
      blocks: [
        'We only collect what the features you use need:',
        {
          list: [
            'Account: full name, email address, password (stored only as a hash, never in plain text), profile photo if you upload one, role, creation date and last sign-in.',
            'Google or Facebook sign-in (if used): the account identifier and email returned by the provider. We never receive those passwords.',
            'Settings and meal profile: language, household description and members (label, age, appetite), diet, allergies or foods to avoid, spice level, favourite regions, cooking time, lunar/solar calendar, vegetarian days and notification choices.',
            'In-app activity: favourite recipes, meal plans and plan change history, saved meals, cooking log (dish, servings, time, notes) and cooking timers.',
            'Chú Rồng assistant: your messages, attached images/PDFs, the assistant replies and any "memories" you allow it to keep (for example tastes or allergies).',
            'Content you post: community stories, cover images, recipe submissions and their stories.',
            'Support requests: name, email, topic and message.',
            'Push notifications (if enabled): the subscription address and encryption keys issued by your browser for timer alerts.',
            'Technical data: sign-in sessions (refresh token stored as a hash, expiry), IP address used for rate limiting (stored as a hash in the database), and server access logs (path, status, time) for operations and security.',
          ],
        },
        'Sensitive data: allergies, diets for health reasons or religious vegetarian days may be sensitive personal data. These fields are optional; enter them only if you want tailored suggestions, and you can delete them at any time in Settings. Please do not send the assistant ID numbers, financial details or medical records.',
        'We do not use third-party behavioural analytics or advertising tools and we do not sell personal data.',
      ],
    },
    {
      id: 'muc-dich',
      title: '3. Purposes and legal basis',
      blocks: [
        {
          list: [
            'Create and protect your account, sign-in, password recovery and email change (codes sent by email).',
            'Provide core features: dish suggestions, meal planning, household portions, cooking log, timers and notifications.',
            'Answer questions through the Chú Rồng assistant and remember preferences you agree to keep.',
            'Display and moderate community content; handle support requests.',
            'Send necessary emails (account security, verification codes, plan reminders if enabled).',
            'Keep the service secure against password guessing, abuse and fraud; meet legal obligations.',
          ],
        },
        'Processing relies on freely given, specific and informed consent or another basis permitted by applicable law. Browsing, silence or accepting the terms does not automatically consent to every processing purpose. Contact support to withdraw consent; this does not affect earlier lawful processing.',
        'We will not use personal data for a new purpose without asking you again.',
      ],
    },
    {
      id: 'ben-thu-ba',
      title: '4. Processors and international transfers',
      blocks: [
        'Depending on deployment configuration and the features you use, the service may use the following providers. Only data necessary for the relevant feature is shared:',
        {
          list: [
            'Vercel Inc. (USA): hosts the web interface and forwards requests to our server.',
            'Render Services, Inc. (USA): runs the application server and keeps operational logs.',
            'Neon (Databricks, Inc., USA): PostgreSQL database when configured.',
            'Google LLC (USA): email delivery via the Gmail API; Google sign-in (if used); the Gemini API for part of the assistant conversations and search embeddings of reference documents; the embedded Google Maps in the footer.',
            'Anthropic PBC (USA): Claude models for assistant conversations when configured.',
            'Meta Platforms, Inc. (USA): Facebook sign-in (if used).',
            "Your browser's push service (e.g. Google, Mozilla, Apple): delivers timer notifications to your device.",
          ],
        },
        'When you use the assistant, your message, attachments, part of the conversation history and relevant meal profile (such as allergies or portions) may be sent to an AI provider to produce a reply. Some questions are answered by an in-house model without leaving our servers.',
        'Some providers may process data outside Vietnam. Locations depend on enabled services and hosting configuration. Contact support for information about recipients, purposes and processing locations. Transfers must meet applicable legal requirements, including consent where required; browsing alone does not constitute consent.',
        'We disclose data to public authorities only upon a lawful request.',
      ],
    },
    {
      id: 'luu-tru',
      title: '5. Retention',
      blocks: [
        {
          list: [
            'Account, settings, plans, favourites, cooking log, conversations and memories: kept until you delete the item or your account.',
            'Sign-in sessions: expire after 12 hours, or after the "Remember this device" period (30 days by default); revoked when you sign out, change your password or sign out everywhere.',
            'Email verification codes: single use, expire after a few minutes.',
            'Cooking timers: kept until they ring or you cancel them, and deleted with your account.',
            'Support requests: retained as necessary to handle the request, resolve disputes and meet legal obligations. You may request access, deletion or restricted processing through support.',
            'Published community stories: remain visible anonymously after account deletion unless you delete them first or ask us to remove them.',
            'Backups and system logs: retention depends on infrastructure configuration and security needs. Access to backup data pending deletion is restricted. Where legal obligations or disputes require retention, we explain the reason and scope when handling your request.',
          ],
        },
      ],
    },
    {
      id: 'bao-mat',
      title: '6. Security measures',
      blocks: [
        'Measures currently in place:',
        {
          list: [
            'Passwords are hashed with a dedicated password-hashing algorithm (Argon2); the system never stores or sends back the original password.',
            'Session refresh tokens are stored hashed and sent in an HttpOnly, SameSite=Lax cookie; access tokens live only in browser memory and are invalidated when the password changes.',
            'Five-digit, single-use email codes with expiry, wrong-attempt limits and resend limits.',
            'Failed sign-in limits per email and per IP address.',
            'HTTPS/TLS encrypted connections; each user’s data is queried by the owning account.',
            'Only authorised administrators can access the admin console, and only as needed for operations, support and moderation.',
          ],
        },
        'No system is perfectly secure. Use a unique, strong password and sign out on shared devices.',
      ],
    },
    {
      id: 'luu-tru-cuc-bo',
      title: '7. Cookies and local storage',
      blocks: [
        'Bep Viet does not use advertising or tracking cookies. We use:',
        {
          list: [
            'An HttpOnly sign-in session cookie and a temporary cookie during Google/Facebook sign-in: required for secure sign-in.',
            'Browser local storage: language, the remembered email when you choose "Remember this device", cooking progress and timers, dish spinner history, read-aloud settings, drafts and cross-tab sign-out signals, assistant greeting state and guest conversations before sign-in.',
            'App cache (service worker): stores interface files so the app opens quickly and can receive notifications.',
          ],
        },
        'Local data stays on your device. You can clear it in your browser settings; some conveniences (remembered email, cooking progress) will then reset. The embedded Google Maps in the footer may set cookies under Google’s policy.',
      ],
    },
    {
      id: 'quyen',
      title: '8. Your rights and how to exercise them',
      blocks: [
        'You have the right to be informed, to consent, to access, rectify and delete your data, to restrict processing, to obtain a copy, to object, to withdraw consent, and to complain, sue and claim compensation as provided by law. How:',
        {
          list: [
            'Access and rectify: view and edit your profile, photo and settings under Account › Profile and Settings.',
            'Get a copy: Account › Settings › "Download my data" (JSON file).',
            'Delete items: remove assistant memories, conversations, favourites, plans, cooking log entries and stories within the app.',
            'Delete your account: Account › Security › "Delete account". This permanently deletes your account and the personal data in section 2; published stories are kept anonymously.',
            'Withdraw consent or object: turn off email/push notifications in Settings, stop using the assistant, or delete your account. Some features may stop working.',
            'Other requests (restriction, content removal, complaints): write to hvlongg@gmail.com or use the Contact support page. We reply within the legal time limit, aiming for 15 days, and may need to verify that you own the account.',
          ],
        },
      ],
    },
    {
      id: 'tre-em',
      title: '9. Children',
      blocks: [
        'The service is intended for people aged 16 and over. Children under 16 may use an account only with the consent and supervision of a parent or guardian. Ages you enter for household members (e.g. "Kid, 6") are used only to calculate portions.',
        'If you find a child’s account created without guardian consent, please contact us and we will delete it.',
      ],
    },
    {
      id: 'vi-pham',
      title: '10. Data breach notification',
      blocks: [
        'If we detect a personal data breach we will contain it, notify the competent data protection authority within the time required by law (currently no later than 72 hours after detection) and notify affected users by email or in the app when the breach may harm you.',
      ],
    },
    {
      id: 'thay-doi',
      title: '11. Changes to this policy',
      blocks: [
        'We may update this policy when features or regulations change. Each update has a version number and effective date at the top of the page. For significant changes we will notify you in the app or by email before they apply and ask for consent again where the law requires.',
      ],
    },
    {
      id: 'lien-he',
      title: '12. Contact',
      blocks: [
        'Hoang Van Long (individual operator of Bep Viet) — 80/57 Me Tri Ha, Tu Liem, Hanoi, Vietnam.',
        'Privacy email: hvlongg@gmail.com. You can also send requests via the Contact support page in the app.',
      ],
    },
  ],
};
