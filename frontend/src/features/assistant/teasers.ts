import { dayPart, type DayPart } from '@/features/assistant/dayPart';

/** Câu gợi ý ngắn theo buổi trong ngày (giờ Việt Nam). */
const teasers: Record<DayPart, readonly string[]> = {
  sang: [
    'Bữa sáng nay ăn gì cho có sức nhỉ? 🍜',
    'Sáng nay bận rộn? Chú Rồng có món nhanh dưới 20 phút!',
    'Một bát phở nóng hay bánh mì trứng cho sáng nay?',
  ],
  trua: [
    'Trưa nay ăn gì đây bạn ơi? 🍱',
    'Chưa nghĩ ra món trưa? Để Chú Rồng giúp nhé!',
    'Trời nóng thế này, trưa nay làm bát canh chua cho mát không?',
  ],
  chieu: [
    'Chiều rồi, tối nay nấu gì để còn kịp đi chợ? 🛒',
    'Xế chiều hơi đói? Một ly chè hay đĩa trái cây cho tỉnh táo nhé!',
    'Lên thực đơn bữa tối từ giờ cho đỡ vội nhé?',
  ],
  toi: [
    'Bữa tối nay bạn ăn gì? 🍲',
    'Nếu chưa biết tối nay ăn gì, hãy nhờ Chú Rồng nhé!',
    'Tủ lạnh còn gì? Kể mình nghe, mình nghĩ món tối giúp!',
    'Mâm cơm tối nay: một món mặn, một canh, một rau nhé?',
  ],
  khuya: [
    'Đói bụng đêm khuya? Chú Rồng biết vài món nhẹ bụng đó!',
    'Lên thực đơn cho ngày mai luôn không bạn?',
  ],
};

/** Câu trò chuyện vui, xen kẽ với câu hỏi gợi ý món. */
const chatter = [
  'Hôm nay bạn thế nào? Nhớ uống đủ nước nhé! 💧',
  'Mẹo nhỏ: phi hành thơm trước khi xào rau sẽ dậy mùi hơn đó!',
  'Chú Rồng vừa xào xong chảo rau, thơm lừng luôn! 🥬',
  'Nấu ăn cùng người thân là vui nhất đó bạn!',
  'Mẹo nhỏ: chần rau qua nước sôi có chút muối sẽ giữ màu xanh đẹp.',
  'Cần ý tưởng món mới? Bấm vào mình nhé!',
] as const;

export function pickTeaser(now = new Date(), random = Math.random) {
  const pool = teasers[dayPart(now)];
  const source = random() < 0.25 ? chatter : pool;
  return source[Math.floor(random() * source.length)] ?? pool[0] ?? chatter[0];
}

export function teaserReplies(): string[] {
  return ['Gợi ý giúp mình nhé', 'Món nhanh dưới 30 phút', 'Gợi ý mâm cơm gia đình'];
}
