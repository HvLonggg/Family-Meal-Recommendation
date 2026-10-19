/** Câu gợi ý ngắn theo thời điểm trong ngày. */
const teasers = {
  morning: [
    'Bữa sáng nay ăn gì cho có sức nhỉ? 🍜',
    'Sáng nay bận rộn? Chú Rồng có món nhanh dưới 20 phút!',
    'Một bát phở nóng hay bánh mì trứng cho sáng nay?',
  ],
  noon: [
    'Trưa nay ăn gì đây bạn ơi? 🍱',
    'Chưa nghĩ ra món trưa? Để Chú Rồng giúp nhé!',
    'Trời nóng thế này, làm bát canh chua cho mát không?',
  ],
  evening: [
    'Bữa tối nay bạn ăn gì? 🍲',
    'Nếu chưa biết ăn gì, hãy nhờ Chú Rồng trợ giúp nhé!',
    'Tủ lạnh còn gì? Kể mình nghe, mình nghĩ món giúp!',
    'Mâm cơm tối nay: một món mặn, một canh, một rau nhé?',
    'Muốn món ngon mà nhanh cho tối nay không?',
  ],
  late: [
    'Đói bụng đêm khuya? Chú Rồng biết vài món nhẹ bụng đó!',
    'Lên thực đơn cho ngày mai luôn không bạn?',
  ],
} as const;

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
  const hour = now.getHours();
  const pool =
    hour < 10
      ? teasers.morning
      : hour < 14
        ? teasers.noon
        : hour < 22
          ? teasers.evening
          : teasers.late;
  const source = random() < 0.5 ? chatter : pool;
  return source[Math.floor(random() * source.length)] ?? teasers.evening[0];
}

export function teaserReplies(): string[] {
  return ['Gợi ý giúp mình nhé', 'Món nhanh dưới 30 phút', 'Gợi ý mâm cơm gia đình'];
}
