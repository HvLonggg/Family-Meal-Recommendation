import type { LegalDocumentContent } from '@/pages/legal/legalTypes';

/*
 * Nội dung bám theo dữ liệu ứng dụng thực sự xử lý (models backend, localStorage frontend).
 * Khi thêm loại dữ liệu hoặc mục đích xử lý mới, cập nhật cả hai bản ngôn ngữ và tăng LEGAL_VERSION.
 */
export const privacyVi: LegalDocumentContent = {
  title: 'Chính sách quyền riêng tư',
  summary:
    'Chính sách này cho biết Bếp Việt thu thập dữ liệu cá nhân nào, sử dụng vào mục đích gì, lưu trữ trong bao lâu, bảo vệ ra sao và bạn có những quyền gì khi sử dụng website và ứng dụng Bếp Việt.',
  effectiveLabel: 'Ngày hiệu lực',
  updatedLabel: 'Cập nhật lần cuối',
  versionLabel: 'Phiên bản',
  tocLabel: 'Mục lục',
  sections: [
    {
      id: 'ben-kiem-soat',
      title: '1. Bên chịu trách nhiệm xử lý dữ liệu',
      blocks: [
        'Bên kiểm soát và xử lý dữ liệu cá nhân là Hoàng Văn Long (cá nhân vận hành Bếp Việt), địa chỉ 80/57 Mễ Trì Hạ, Từ Liêm, Hà Nội ("Bếp Việt", "chúng tôi"). Đầu mối bảo vệ dữ liệu cá nhân: Hoàng Văn Long, điện thoại 0364892903, email hvlongg@gmail.com.',
        'Chúng tôi xử lý dữ liệu cá nhân theo pháp luật Việt Nam về bảo vệ dữ liệu cá nhân, bao gồm Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, các văn bản hướng dẫn thi hành và quy định liên quan còn hiệu lực (như Nghị định 13/2023/NĐ-CP trong phạm vi còn áp dụng).',
      ],
    },
    {
      id: 'du-lieu-thu-thap',
      title: '2. Dữ liệu chúng tôi thu thập',
      blocks: [
        'Chúng tôi chỉ thu thập dữ liệu cần thiết cho tính năng bạn sử dụng:',
        {
          list: [
            'Thông tin tài khoản: họ tên, email, mật khẩu (chỉ lưu dạng mã hóa một chiều), ảnh đại diện nếu bạn tải lên; mã định danh và email do Google hoặc Facebook cung cấp nếu bạn đăng nhập bằng các tài khoản này.',
            'Sở thích và hồ sơ bữa ăn: ngôn ngữ, thành viên gia đình (nhãn, độ tuổi, sức ăn), chế độ ăn, dị ứng hoặc thực phẩm cần tránh, khẩu vị, vùng miền yêu thích, ngày ăn chay và lựa chọn nhận thông báo.',
            'Nội dung bạn tạo hoặc gửi: món yêu thích, kế hoạch bữa ăn, mâm cơm đã lưu, nhật ký nấu, hẹn giờ; tin nhắn và tệp gửi cho trợ lý Chú Rồng cùng các ghi nhớ bạn cho phép lưu; bài viết, công thức đề xuất và yêu cầu hỗ trợ.',
            'Dữ liệu sử dụng và kỹ thuật: phiên đăng nhập, địa chỉ IP (dùng để chống lạm dụng), nhật ký truy cập máy chủ và thông tin đăng ký nhận thông báo đẩy nếu bạn bật.',
          ],
        },
        'Thông tin dị ứng, chế độ ăn vì lý do sức khỏe hoặc ngày ăn chay theo tín ngưỡng có thể là dữ liệu cá nhân nhạy cảm. Các trường này không bắt buộc và có thể xóa bất cứ lúc nào trong Cài đặt. Vui lòng không gửi cho trợ lý số giấy tờ tùy thân, thông tin tài chính hay hồ sơ bệnh án.',
      ],
    },
    {
      id: 'muc-dich',
      title: '3. Mục đích và cơ sở xử lý',
      blocks: [
        {
          list: [
            'Tạo, xác thực và bảo vệ tài khoản; khôi phục mật khẩu, đổi email.',
            'Cung cấp tính năng: gợi ý món, kế hoạch bữa ăn, khẩu phần theo gia đình, nhật ký nấu, hẹn giờ và thông báo.',
            'Trả lời câu hỏi qua trợ lý Chú Rồng và ghi nhớ sở thích bạn đồng ý lưu.',
            'Hiển thị, kiểm duyệt nội dung cộng đồng và xử lý yêu cầu hỗ trợ.',
            'Gửi email cần thiết về bảo mật, mã xác thực và lời nhắc bạn đã bật.',
            'Bảo đảm an ninh, phòng chống lạm dụng, gian lận và thực hiện nghĩa vụ pháp lý.',
          ],
        },
        'Chúng tôi xử lý dữ liệu trên cơ sở sự đồng ý tự nguyện, rõ ràng của bạn cho từng mục đích đã thông báo, hoặc các căn cứ khác pháp luật cho phép như thực hiện thỏa thuận sử dụng dịch vụ hay nghĩa vụ pháp lý. Việc chỉ truy cập website hoặc im lặng không được coi là sự đồng ý. Chúng tôi không sử dụng dữ liệu cho mục đích mới khi chưa hỏi lại ý kiến của bạn.',
      ],
    },
    {
      id: 'ben-thu-ba',
      title: '4. Chia sẻ dữ liệu',
      blocks: [
        'Chúng tôi không bán dữ liệu cá nhân và không sử dụng công cụ quảng cáo hay theo dõi hành vi của bên thứ ba.',
        'Chúng tôi có thể sử dụng một số nhà cung cấp dịch vụ hạ tầng, email, đăng nhập và trí tuệ nhân tạo uy tín, có thể đặt máy chủ ở nước ngoài, để vận hành dịch vụ. Họ chỉ được xử lý dữ liệu cần thiết theo chỉ dẫn của chúng tôi và phải bảo mật dữ liệu. Khi bạn dùng trợ lý, nội dung câu hỏi và thông tin liên quan có thể được gửi tới nhà cung cấp AI để tạo câu trả lời. Việc chuyển dữ liệu ra nước ngoài tuân thủ điều kiện của pháp luật Việt Nam; bạn có thể yêu cầu thông tin về bên nhận dữ liệu qua hòm thư hỗ trợ.',
        'Chúng tôi chỉ cung cấp dữ liệu cho cơ quan nhà nước khi có yêu cầu hợp pháp theo quy định của pháp luật.',
      ],
    },
    {
      id: 'luu-tru',
      title: '5. Thời hạn lưu trữ',
      blocks: [
        {
          list: [
            'Tài khoản, cài đặt, kế hoạch, nhật ký nấu, hội thoại và ghi nhớ: lưu đến khi bạn xóa từng mục hoặc xóa tài khoản.',
            'Phiên đăng nhập và mã xác thực: tự hết hạn sau thời gian ngắn; phiên bị thu hồi khi bạn đăng xuất hoặc đổi mật khẩu.',
            'Yêu cầu hỗ trợ: lưu trong thời gian cần thiết để xử lý yêu cầu, giải quyết tranh chấp và thực hiện nghĩa vụ pháp lý.',
            'Bài viết đã xuất bản: tiếp tục hiển thị ở dạng ẩn danh sau khi tài khoản bị xóa, trừ khi bạn xóa bài trước hoặc yêu cầu gỡ.',
            'Bản sao lưu và nhật ký hệ thống: lưu trong thời gian giới hạn phục vụ an ninh và khôi phục, được hạn chế truy cập.',
          ],
        },
      ],
    },
    {
      id: 'bao-mat',
      title: '6. Bảo mật dữ liệu',
      blocks: [
        'Chúng tôi áp dụng các biện pháp kỹ thuật và quản lý phù hợp: mã hóa kết nối, lưu mật khẩu dưới dạng mã hóa một chiều, giới hạn số lần đăng nhập sai, tách biệt dữ liệu theo tài khoản và chỉ cho phép quản trị viên được phân quyền truy cập trong phạm vi cần thiết.',
        'Không có hệ thống nào an toàn tuyệt đối. Hãy dùng mật khẩu mạnh, riêng biệt và đăng xuất trên thiết bị dùng chung. Khi xảy ra sự cố vi phạm dữ liệu cá nhân, chúng tôi sẽ khắc phục, thông báo cho cơ quan chuyên trách trong thời hạn pháp luật quy định (hiện là không quá 72 giờ kể từ khi phát hiện) và thông báo cho người dùng bị ảnh hưởng khi sự cố có thể gây hại cho bạn.',
      ],
    },
    {
      id: 'quyen',
      title: '7. Quyền của bạn',
      blocks: [
        'Theo quy định của pháp luật, bạn có quyền được biết, đồng ý hoặc rút lại sự đồng ý, truy cập, chỉnh sửa, xóa, hạn chế xử lý, phản đối xử lý, nhận bản sao dữ liệu, khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường. Bạn có thể thực hiện:',
        {
          list: [
            'Truy cập và chỉnh sửa hồ sơ, cài đặt tại Tài khoản › Hồ sơ và Cài đặt.',
            'Nhận bản sao dữ liệu tại Tài khoản › Cài đặt › "Tải dữ liệu của tôi".',
            'Xóa từng mục (ghi nhớ, hội thoại, kế hoạch, nhật ký, bài viết) trong ứng dụng, hoặc xóa toàn bộ tài khoản tại Tài khoản › Bảo mật.',
            'Rút lại sự đồng ý hoặc phản đối bằng cách tắt thông báo, ngừng dùng trợ lý hoặc xóa tài khoản; một số tính năng có thể không còn hoạt động.',
            'Các yêu cầu khác và khiếu nại: gửi tới hvlongg@gmail.com hoặc trang Liên hệ hỗ trợ. Chúng tôi phản hồi trong thời hạn pháp luật quy định, mục tiêu trong vòng 15 ngày, và có thể cần xác minh bạn là chủ tài khoản.',
          ],
        },
      ],
    },
    {
      id: 'luu-tru-cuc-bo',
      title: '8. Cookie và lưu trữ cục bộ',
      blocks: [
        'Bếp Việt không dùng cookie quảng cáo hay theo dõi. Chúng tôi chỉ dùng cookie cần thiết cho đăng nhập an toàn, cùng bộ nhớ cục bộ và bộ nhớ đệm của trình duyệt để ghi nhớ ngôn ngữ, bản nháp, tiến độ nấu và giúp ứng dụng mở nhanh. Dữ liệu này nằm trên thiết bị của bạn và có thể xóa trong cài đặt trình duyệt. Nội dung nhúng của bên thứ ba (ví dụ bản đồ) có thể đặt cookie theo chính sách riêng của họ.',
      ],
    },
    {
      id: 'tre-em',
      title: '9. Trẻ em',
      blocks: [
        'Dịch vụ dành cho người từ đủ 16 tuổi. Người dưới 16 tuổi chỉ được sử dụng khi có sự đồng ý và giám sát của cha, mẹ hoặc người giám hộ. Độ tuổi thành viên gia đình bạn nhập chỉ dùng để tính khẩu phần. Nếu phát hiện tài khoản của trẻ em được tạo khi chưa có sự đồng ý của người giám hộ, vui lòng liên hệ để chúng tôi xóa.',
      ],
    },
    {
      id: 'thay-doi',
      title: '10. Thay đổi chính sách',
      blocks: [
        'Chúng tôi có thể cập nhật chính sách khi tính năng hoặc quy định thay đổi; phiên bản và ngày cập nhật được ghi ở đầu trang. Với thay đổi quan trọng, chúng tôi thông báo trong ứng dụng hoặc qua email trước khi áp dụng và hỏi lại sự đồng ý khi pháp luật yêu cầu.',
      ],
    },
    {
      id: 'lien-he',
      title: '11. Liên hệ',
      blocks: [
        'Hoàng Văn Long (cá nhân vận hành Bếp Việt) — 80/57 Mễ Trì Hạ, Từ Liêm, Hà Nội — hvlongg@gmail.com. Bạn cũng có thể gửi yêu cầu qua trang Liên hệ hỗ trợ trong ứng dụng.',
      ],
    },
  ],
};

export const privacyEn: LegalDocumentContent = {
  title: 'Privacy Policy',
  summary:
    'This policy explains what personal data Bep Viet collects, why we use it, how long we keep it, how we protect it and what rights you have when using the Bep Viet website and app. The Vietnamese version prevails if the two versions differ.',
  effectiveLabel: 'Effective date',
  updatedLabel: 'Last updated',
  versionLabel: 'Version',
  tocLabel: 'Contents',
  sections: [
    {
      id: 'ben-kiem-soat',
      title: '1. Who is responsible for your data',
      blocks: [
        'The data controller and processor is Hoang Van Long (individual operator of Bep Viet), 80/57 Me Tri Ha, Tu Liem, Hanoi, Vietnam ("Bep Viet", "we"). Data protection contact: Hoang Van Long, phone +84 364 892 903, email hvlongg@gmail.com.',
        'We process personal data under Vietnamese personal data protection law, including the Law on Personal Data Protection No. 91/2025/QH15, its implementing regulations and related regulations still in force (such as Decree 13/2023/ND-CP to the extent it still applies).',
      ],
    },
    {
      id: 'du-lieu-thu-thap',
      title: '2. Data we collect',
      blocks: [
        'We only collect what the features you use need:',
        {
          list: [
            'Account information: name, email, password (stored only as a one-way hash), profile photo if you upload one; the identifier and email provided by Google or Facebook if you sign in with them.',
            'Preferences and meal profile: language, household members (label, age, appetite), diet, allergies or foods to avoid, tastes, favourite regions, vegetarian days and notification choices.',
            'Content you create or submit: favourites, meal plans, saved meals, cooking log, timers; messages and files sent to the Chú Rồng assistant and memories you allow it to keep; stories, recipe submissions and support requests.',
            'Usage and technical data: sign-in sessions, IP address (used to prevent abuse), server access logs and push subscription details if you enable notifications.',
          ],
        },
        'Allergies, diets for health reasons or religious vegetarian days may be sensitive personal data. These fields are optional and can be deleted at any time in Settings. Please do not send the assistant ID numbers, financial details or medical records.',
      ],
    },
    {
      id: 'muc-dich',
      title: '3. Purposes and legal basis',
      blocks: [
        {
          list: [
            'Create, verify and protect your account; recover passwords and change email.',
            'Provide features: dish suggestions, meal planning, household portions, cooking log, timers and notifications.',
            'Answer questions through the Chú Rồng assistant and remember preferences you agree to keep.',
            'Display and moderate community content and handle support requests.',
            'Send necessary emails about security, verification codes and reminders you enabled.',
            'Keep the service secure, prevent abuse and fraud, and meet legal obligations.',
          ],
        },
        'We process data on the basis of your freely given, specific consent for each stated purpose, or other bases permitted by law such as performing our service agreement or legal obligations. Browsing or silence is not consent. We will not use data for a new purpose without asking you again.',
      ],
    },
    {
      id: 'ben-thu-ba',
      title: '4. Data sharing',
      blocks: [
        'We do not sell personal data and do not use third-party advertising or behavioural tracking tools.',
        'We may use reputable infrastructure, email, sign-in and artificial intelligence providers, some with servers outside Vietnam, to operate the service. They may process only the data necessary, on our instructions, and must keep it confidential. When you use the assistant, your question and related information may be sent to an AI provider to produce a reply. International transfers comply with Vietnamese legal requirements; you can ask support for information about recipients.',
        'We disclose data to public authorities only upon a lawful request.',
      ],
    },
    {
      id: 'luu-tru',
      title: '5. Retention',
      blocks: [
        {
          list: [
            'Account, settings, plans, cooking log, conversations and memories: kept until you delete the item or your account.',
            'Sign-in sessions and verification codes: expire automatically after a short time; sessions are revoked when you sign out or change your password.',
            'Support requests: kept as long as needed to handle the request, resolve disputes and meet legal obligations.',
            'Published stories: remain visible anonymously after account deletion unless you delete them first or ask us to remove them.',
            'Backups and system logs: kept for a limited time for security and recovery, with restricted access.',
          ],
        },
      ],
    },
    {
      id: 'bao-mat',
      title: '6. Data security',
      blocks: [
        'We apply appropriate technical and organisational measures: encrypted connections, one-way hashed passwords, limits on failed sign-ins, data separated by account, and admin access only for authorised staff as needed.',
        'No system is perfectly secure. Use a strong, unique password and sign out on shared devices. If a personal data breach occurs, we will contain it, notify the competent authority within the time required by law (currently no later than 72 hours after detection) and notify affected users when the breach may harm you.',
      ],
    },
    {
      id: 'quyen',
      title: '7. Your rights',
      blocks: [
        'As provided by law, you have the right to be informed, to give or withdraw consent, to access, rectify and delete your data, to restrict or object to processing, to obtain a copy, and to complain, sue and claim compensation. You can:',
        {
          list: [
            'Access and edit your profile and settings under Account › Profile and Settings.',
            'Get a copy of your data under Account › Settings › "Download my data".',
            'Delete individual items (memories, conversations, plans, cooking log, stories) in the app, or delete your whole account under Account › Security.',
            'Withdraw consent or object by turning off notifications, stopping use of the assistant or deleting your account; some features may stop working.',
            'Other requests and complaints: write to hvlongg@gmail.com or use the Contact support page. We reply within the legal time limit, aiming for 15 days, and may need to verify that you own the account.',
          ],
        },
      ],
    },
    {
      id: 'luu-tru-cuc-bo',
      title: '8. Cookies and local storage',
      blocks: [
        'Bep Viet does not use advertising or tracking cookies. We only use cookies needed for secure sign-in, plus browser local storage and cache to remember your language, drafts and cooking progress and to open the app quickly. This data stays on your device and can be cleared in your browser settings. Embedded third-party content (such as maps) may set cookies under its own policy.',
      ],
    },
    {
      id: 'tre-em',
      title: '9. Children',
      blocks: [
        'The service is intended for people aged 16 and over. Anyone under 16 may use it only with the consent and supervision of a parent or guardian. Ages you enter for household members are used only to calculate portions. If you find a child’s account created without guardian consent, please contact us and we will delete it.',
      ],
    },
    {
      id: 'thay-doi',
      title: '10. Changes to this policy',
      blocks: [
        'We may update this policy when features or regulations change; the version and update date appear at the top of the page. For significant changes we will notify you in the app or by email before they apply and ask for consent again where the law requires.',
      ],
    },
    {
      id: 'lien-he',
      title: '11. Contact',
      blocks: [
        'Hoang Van Long (individual operator of Bep Viet) — 80/57 Me Tri Ha, Tu Liem, Hanoi, Vietnam — hvlongg@gmail.com. You can also send requests via the Contact support page in the app.',
      ],
    },
  ],
};
