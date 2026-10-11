import bunChaImage from '@/assets/auth/bun-cha-pho-hoi.webp';
import familyMealImage from '@/assets/auth/mam-com-nha.webp';
import phoImage from '@/assets/auth/pho-bep-nha.webp';
import braisedCarpImage from '@/assets/recipes/ca-chep-kho-rieng.jpg';
import sourFishSoupImage from '@/assets/recipes/canh-chua-ca.jpg';
import tomatoTofuImage from '@/assets/recipes/dau-hu-sot-ca-chua-cc-by-sa.jpg';
import waterSpinachImage from '@/assets/recipes/rau-muong-xao-toi-cc0.jpg';
import sweetSourRibsImage from '@/assets/recipes/suon-xao-chua-ngot.jpg';
import vegetableOmeletteImage from '@/assets/recipes/trung-chien-rau-cu.jpg';
import editedImages from '@/data/recipeImageAssets.json';

export type Ingredient = {
  name: string;
  amount: number | null;
  unit: string;
  note?: string;
  scalable?: boolean;
  scalingRule?: 'linear' | 'taste_adjusted' | 'fixed_ratio' | 'vessel_dependent';
};

export type Recipe = {
  slug: string;
  catalogId?: string;
  aliases?: string[];
  regions?: string[];
  passiveMinutes?: number;
  finishedDish?: string;
  tips?: string[];
  pairingSlugs?: string[];
  family?: string;
  ingredientCategory?: string;
  servingBasis?: string;
  scalingTargets?: { servings: number; seasoning_start_factor: number }[];
  name: string;
  excerpt: string;
  image: string;
  imageSrcSet?: string;
  imageMaster?: string;
  imageAlt: string;
  imageCredit?: string;
  imageCreditUrl?: string;
  imageLicense?: string;
  imageKind?: 'project' | 'licensed' | 'reference';
  region: 'Bắc' | 'Trung' | 'Nam' | 'Ba miền';
  category:
    | 'Món mặn'
    | 'Món canh'
    | 'Món rau'
    | 'Món chay'
    | 'Món nước'
    | 'Món tráng miệng'
    | 'Món ăn sáng'
    | 'Món ăn kèm';
  difficulty: 'Dễ' | 'Vừa' | 'Trung bình' | 'Khó';
  prepMinutes: number;
  cookMinutes: number;
  servings: number;
  ingredients: { group: string; items: Ingredient[] }[];
  preparation: string[];
  cooking: string[];
  serving: string;
  tip: string;
  tags: string[];
  sourceName: string;
  sourceUrl: string;
  status?: 'published' | 'draft';
};

const recipeCatalog: Recipe[] = [
  {
    slug: 'ca-chep-kho-rieng',
    name: 'Cá chép kho riềng',
    excerpt: 'Cá chắc thịt, thơm riềng và thấm vị; một món mặn quen thuộc cho mâm cơm miền Bắc.',
    image: braisedCarpImage,
    imageAlt: 'Nồi cá chép kho riềng màu nâu hổ phách trên bàn gỗ',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Bắc',
    category: 'Món mặn',
    difficulty: 'Dễ',
    prepMinutes: 30,
    cookMinutes: 45,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu chính',
        items: [
          { name: 'Cá chép', amount: 500, unit: 'g' },
          { name: 'Thịt ba chỉ', amount: 50, unit: 'g' },
          { name: 'Riềng tươi', amount: 100, unit: 'g' },
          { name: 'Lá trà xanh', amount: 200, unit: 'g' },
          { name: 'Mía', amount: 1, unit: 'khúc 40 cm' },
        ],
      },
      {
        group: 'Gia vị',
        items: [
          { name: 'Nước tương', amount: 5, unit: 'muỗng canh' },
          { name: 'Dầu điều', amount: 1, unit: 'muỗng canh' },
          { name: 'Nước màu', amount: 1, unit: 'muỗng cà phê' },
          { name: 'Muối', amount: 3, unit: 'g' },
          { name: 'Hạt nêm', amount: 2, unit: 'g', note: 'có thể gia giảm' },
          { name: 'Tiêu, ớt và hành lá', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Mía chẻ thành lát vừa đáy nồi. Lá trà xanh rửa sạch, vò nhẹ; hã nhanh một lượt rồi thay nước, tiếp tục hã khoảng 5 phút để lấy gần 3 chén nước trà.',
      'Rửa cá với muối và một ít giấm, để 10 phút rồi chắt bỏ phần nước nhớt. Thấm cá thật khô và khứa nông trên mình cá để gia vị dễ thấm.',
      'Chia riềng thành hai phần: một phần giã để lấy nước, phần còn lại thái lát. Ướp cá 30 phút với nước riềng, nước tương, muối, tiêu, nước màu, dầu điều, hạt nêm và ớt đập dập.',
      'Thịt ba chỉ cắt miếng nhỏ khoảng 1 cm, ướp với đầu hành băm và tiêu. Cá sau khi ướp được chiên sơ cùng vài lát riềng để bề mặt săn lại.',
    ],
    cooking: [
      'Lót mía dưới đáy niêu, sau đó xếp cá, thịt ba chỉ và riềng lát thành từng lớp. Rưới toàn bộ phần nước ướp còn lại lên trên.',
      'Đặt niêu lên lửa lớn vừa đủ để cá săn và nước kho sôi đều. Nghiêng nhẹ niêu thay vì dùng đũa đảo để cá không bị vỡ.',
      'Rót nước trà nóng vào gần xâm xấp mặt cá, đậy nắp và hạ lửa nhỏ. Kho khoảng 35–40 phút để cá chín mềm, riềng và trà thấm sâu vào thịt cá.',
      'Khi nước kho cạn còn sền sệt, nêm lại cho vị mặn-ngọt hài hòa. Rắc ớt sừng và hành lá, tắt bếp rồi để cá nghỉ 5 phút trước khi gắp.',
    ],
    serving: 'Dùng nóng cùng cơm trắng, rau luộc và một bát canh thanh.',
    tip: 'Mía giúp chống bén đáy và tạo hậu ngọt; nước trà làm vị cá thanh hơn. Khi kho chỉ nghiêng niêu, không đảo trực tiếp.',
    tags: ['cơm nhà', 'cá kho', 'miền Bắc'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/ca-chep-kho-rieng/',
  },
  {
    slug: 'suon-xao-chua-ngot',
    name: 'Sườn xào chua ngọt',
    excerpt: 'Sườn mềm, áo xốt chua ngọt cân bằng, hợp cả người lớn lẫn trẻ nhỏ.',
    image: sweetSourRibsImage,
    imageAlt: 'Đĩa sườn xào chua ngọt với ớt chuông và hành tây',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Ba miền',
    category: 'Món mặn',
    difficulty: 'Dễ',
    prepMinutes: 15,
    cookMinutes: 20,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu chính',
        items: [
          { name: 'Sườn non', amount: 400, unit: 'g' },
          { name: 'Ớt chuông xanh, đỏ, vàng', amount: 3, unit: 'quả' },
          { name: 'Hành tây', amount: 1, unit: 'củ' },
          { name: 'Lòng trắng trứng', amount: 1, unit: 'phần' },
          { name: 'Bột năng', amount: 2, unit: 'muỗng canh' },
        ],
      },
      {
        group: 'Xốt chua ngọt',
        items: [
          { name: 'Giấm gạo', amount: 0.5, unit: 'muỗng canh' },
          { name: 'Đường', amount: 1, unit: 'muỗng canh' },
          { name: 'Nước tương', amount: 0.5, unit: 'muỗng canh' },
          { name: 'Tương cà', amount: 1, unit: 'muỗng canh' },
          { name: 'Nước', amount: 0.5, unit: 'chén' },
          { name: 'Hành tím, tỏi, tiêu và ngò rí', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Chẻ sườn dọc theo xương rồi chặt khúc khoảng 4 cm. Ướp 10 phút với đường, muối, chút nước tương, tiêu và hành tím băm.',
      'Trộn sườn đã ướp với lòng trắng trứng, sau đó áo một lớp bột năng thật mỏng. Lớp áo này giúp giữ nước ngọt và làm xốt bám đều.',
      'Cắt hành tây và ba màu ớt chuông thành miếng vuông cạnh khoảng 3 cm. Khuấy giấm, đường, nước tương, tương cà và nửa chén nước thành hỗn hợp xốt.',
    ],
    cooking: [
      'Xào nhanh hành tây và ớt chuông trên lửa lớn khoảng 1 phút rồi trút ra đĩa. Rau chỉ cần vừa thơm, vẫn giữ độ giòn và màu tươi.',
      'Đun nóng dầu, chiên sườn đến khi vàng đều các mặt. Gắp sườn ra giá hoặc giấy thấm để loại bỏ dầu thừa.',
      'Phi thơm tỏi, cho hỗn hợp xốt vào đun lửa nhỏ. Thêm sườn và đảo khoảng 5 phút để thịt chín mềm, thấm vị chua ngọt.',
      'Nếu xốt còn loãng, thêm một ít nước bột năng. Cho hành tây và ớt chuông trở lại, đảo nhanh đến khi xốt phủ bóng rồi tắt bếp.',
    ],
    serving: 'Dọn nóng với cơm trắng; rắc thêm tiêu nếu thích.',
    tip: 'Áo bột sau khi ướp giúp miếng sườn không khô; rau củ nên xào riêng và cho lại vào chảo ở bước cuối.',
    tags: ['dễ nấu', 'trẻ em thích', 'món mặn'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/suon-xao-chua-ngot/',
  },
  {
    slug: 'canh-chua-ca',
    name: 'Canh chua cá',
    excerpt: 'Vị chua dịu từ me và dứa, cá mềm ngọt, nhiều rau — rất hợp ngày nóng.',
    image: sourFishSoupImage,
    imageAlt: 'Bát canh chua cá với cà chua, dứa, đậu bắp và rau thơm',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Nam',
    category: 'Món canh',
    difficulty: 'Dễ',
    prepMinutes: 15,
    cookMinutes: 15,
    servings: 4,
    ingredients: [
      {
        group: 'Cá và rau',
        items: [
          { name: 'Cá liệt, cá diêu hồng hoặc cá lóc', amount: 250, unit: 'g' },
          { name: 'Thơm', amount: 100, unit: 'g' },
          { name: 'Cà chua', amount: 100, unit: 'g' },
          { name: 'Bạc hà (dọc mùng)', amount: 100, unit: 'g' },
        ],
      },
      {
        group: 'Tạo vị',
        items: [
          { name: 'Nước', amount: 1.7, unit: 'lít' },
          { name: 'Nước mắm', amount: 2, unit: 'muỗng canh' },
          { name: 'Hành tím băm', amount: 1, unit: 'muỗng cà phê' },
          { name: 'Gia vị tạo vị chua cay', amount: null, unit: 'vừa đủ', scalable: false },
          { name: 'Rau om và hành lá', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Cá làm sạch, cắt khúc vừa ăn, rửa nhanh với nước muối loãng rồi để thật ráo. Nếu dùng cá nguyên con, khứa nông hai bên để cá chín đều.',
      'Cà chua bổ múi cau; thơm cắt miếng rẻ quạt. Bạc hà tước bỏ lớp xơ ngoài, thái lát mỏng rồi bóp nhẹ với muối và rửa lại.',
      'Rau om và hành lá nhặt sạch, rửa, để ráo rồi cắt nhỏ. Chuẩn bị sẵn toàn bộ gia vị để canh không phải nấu quá lâu sau khi cho rau vào.',
    ],
    cooking: [
      'Phi thơm hành tím với một ít dầu, cho cà chua vào đảo nhanh khoảng 1 phút để tạo màu và vị nền cho nước canh.',
      'Rót 1,7 lít nước vào nồi. Khi nước sôi, thả cá và thơm vào, đợi sôi trở lại rồi hớt bọt để nước dùng trong.',
      'Giữ lửa vừa và nấu cá thêm khoảng 5 phút. Cho bạc hà vào, nêm gia vị chua cay và nước mắm sao cho vị chua nhẹ, ngọt hậu và mặn vừa.',
      'Cho rau om và hành lá vào cuối cùng, đảo nhẹ rồi tắt bếp. Đậy nắp 1 phút để hương rau lan đều nhưng rau không bị thâm.',
    ],
    serving: 'Dùng nóng trong bữa cơm hoặc ăn kèm bún.',
    tip: 'Cho cá khi nước đã sôi, hớt bọt kỹ và chỉ đảo nhẹ một lần để nước canh trong, miếng cá không bị nát.',
    tags: ['món canh', 'miền Nam', 'thanh mát'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/canh-chua-ca-mien-nam/',
  },
  {
    slug: 'trung-chien-rau-cu',
    name: 'Trứng chiên rau củ',
    excerpt: 'Món nhanh gọn trong 15 phút, có màu sắc vui mắt và dễ kết hợp với cơm nóng.',
    image: vegetableOmeletteImage,
    imageAlt: 'Đĩa trứng chiên vàng với cà rốt, đậu que và hành lá',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Ba miền',
    category: 'Món mặn',
    difficulty: 'Dễ',
    prepMinutes: 8,
    cookMinutes: 7,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu',
        items: [
          { name: 'Trứng gà', amount: 3, unit: 'quả' },
          { name: 'Cà chua', amount: 0.5, unit: 'quả' },
          { name: 'Hành tây', amount: 0.25, unit: 'củ' },
          { name: 'Đậu que', amount: 5, unit: 'trái' },
          { name: 'Xốt mayonnaise', amount: 2, unit: 'muỗng canh' },
          {
            name: 'Hành lá, ngò rí, hành tím và tiêu',
            amount: null,
            unit: 'vừa đủ',
            scalable: false,
          },
        ],
      },
    ],
    preparation: [
      'Cà chua bỏ hạt rồi cắt hạt lựu. Hành tây cũng cắt hạt lựu; đậu que tước xơ và thái lát mỏng để nhanh chín.',
      'Đập trứng vào tô, thêm tiêu, một lượng gia vị vừa ăn, hành lá cắt nhỏ và mayonnaise. Đánh nhẹ cho hỗn hợp hòa quyện nhưng không tạo quá nhiều bọt.',
      'Để riêng phần rau củ và trứng. Việc xào rau trước giúp rau ráo nước, thơm và không làm mặt trứng bị rỗ.',
    ],
    cooking: [
      'Phi thơm hành tím với một lớp dầu mỏng, cho đậu que, hành tây và cà chua vào xào nhanh đến khi rau vừa săn.',
      'Hạ xuống lửa nhỏ, rót trứng theo vòng quanh chảo để rau củ và mayonnaise phân bố đều. Dùng xẻng chỉnh nhẹ phần rau nhưng không khuấy.',
      'Đậy nắp và chiên đến khi đáy vàng, mặt trứng vừa chín tới. Có thể chia trứng thành miếng trước khi lật nếu muốn hai mặt vàng đều.',
    ],
    serving: 'Cắt miếng, dùng nóng với cơm và dưa leo.',
    tip: 'Chiên trên lửa nhỏ và đậy nắp giúp trứng chín đều, không cháy đáy; mayonnaise làm trứng mềm và béo hơn.',
    tags: ['15 phút', 'tiết kiệm', 'dễ nấu'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/trung-chien-rau-cu-xot-mayonnaise/',
  },
  {
    slug: 'canh-rau-ngot-thit-bam',
    name: 'Canh rau ngót thịt băm',
    excerpt:
      'Bát canh xanh dịu, vị ngọt tự nhiên, dễ nấu và xuất hiện thường xuyên trong bữa cơm nhà.',
    image: familyMealImage,
    imageAlt: 'Mâm cơm nhà với bát canh rau xanh',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Bắc',
    category: 'Món canh',
    difficulty: 'Dễ',
    prepMinutes: 10,
    cookMinutes: 12,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu',
        items: [
          { name: 'Rau ngót', amount: 350, unit: 'g' },
          { name: 'Thịt heo băm', amount: 150, unit: 'g' },
          { name: 'Hành tím', amount: 1, unit: 'củ' },
          { name: 'Nước mắm, muối và tiêu', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Tuốt lấy lá non, bỏ cọng già và lá sâu. Rửa rau qua 2–3 lần nước, để ráo rồi vò nhẹ từng nắm để lá mềm nhưng không bị nát.',
      'Ướp thịt băm 8–10 phút với 1 muỗng cà phê nước mắm, một nhúm tiêu và nửa lượng hành tím băm.',
      'Chuẩn bị khoảng 1 lít nước nóng. Việc dùng nước nóng sau khi xào thịt giúp nồi canh sôi lại nhanh, thịt không bị dai.',
    ],
    cooking: [
      'Cho một muỗng cà phê dầu vào nồi, phi thơm hành còn lại rồi cho thịt vào đảo tơi trên lửa vừa đến khi vừa săn.',
      'Rót nước nóng vào, đun sôi 3–4 phút và hớt sạch bọt để nước canh trong. Nêm một lượng nhỏ muối hoặc hạt nêm.',
      'Cho rau ngót vào khi nước đang sôi, dùng đũa nhấn rau ngập nước. Nấu 2–3 phút không đậy vung để rau giữ màu xanh.',
      'Nếm lại bằng nước mắm, tắt bếp ngay khi lá vừa mềm. Không nấu lâu vì rau sẽ sẫm màu và mất vị ngọt.',
    ],
    serving: 'Dùng ngay khi canh còn nóng cùng món kho hoặc món rang.',
    tip: 'Vò rau nhẹ trước khi nấu để rau mềm và nước canh ngọt hơn.',
    tags: ['canh nhà', 'nhanh gọn', 'rau xanh'],
    sourceName: 'Cookpad',
    sourceUrl: 'https://cookpad.com/vn/cong-thuc/6203425',
    status: 'draft',
  },
  {
    slug: 'rau-muong-xao-toi',
    name: 'Rau muống xào tỏi',
    excerpt: 'Rau xanh giòn, thơm tỏi, hoàn thiện mâm cơm chỉ trong khoảng 10 phút.',
    image: waterSpinachImage,
    imageAlt: 'Đĩa rau muống xào xanh với những lát tỏi',
    imageCredit: 'Andy Li / Wikimedia Commons',
    imageCreditUrl:
      'https://commons.wikimedia.org/wiki/File:Pad_Pak_Bung_(Morning_glory)_-_Thai_Street_Food,_Worthing_2026-08-21.jpg',
    imageLicense: 'CC0 1.0',
    imageKind: 'licensed',
    region: 'Ba miền',
    category: 'Món rau',
    difficulty: 'Dễ',
    prepMinutes: 6,
    cookMinutes: 4,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu',
        items: [
          { name: 'Rau muống', amount: 500, unit: 'g' },
          { name: 'Tỏi', amount: 5, unit: 'tép' },
          { name: 'Dầu ăn', amount: 2, unit: 'muỗng canh' },
          { name: 'Nước mắm và muối', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Nhặt bỏ gốc già và lá úa, ngắt rau thành đoạn 8–10 cm. Rửa nhanh 2–3 lần rồi ngâm nước muối loãng 5 phút, vớt ra để thật ráo.',
      'Đập dập tỏi, băm thô và chia hai phần. Pha sẵn nước mắm với 1 muỗng canh nước để gia vị phân tán nhanh khi xào.',
      'Nếu rau thân to, chần 30 giây trong nước sôi có chút muối rồi ngâm nhanh vào nước mát; bước này giúp rau chín đều và xanh.',
    ],
    cooking: [
      'Làm nóng chảo lớn trên lửa cao đến khi chảo thật nóng. Cho dầu và hai phần ba lượng tỏi vào phi khoảng 15 giây.',
      'Cho toàn bộ rau vào, dùng hai xẻng đảo liên tục để rau tiếp xúc đều với mặt chảo. Không đậy vung.',
      'Sau khoảng 90 giây, rưới hỗn hợp nước mắm quanh thành chảo, đảo thêm 30–60 giây đến khi cọng rau vừa mềm nhưng còn giòn.',
      'Cho phần tỏi còn lại vào, đảo nhanh rồi tắt bếp. Gắp rau ra đĩa ngay để nhiệt trong chảo không làm rau chín quá.',
    ],
    serving: 'Dùng nóng; có thể kèm bát nước rau luộc dầm sấu vào mùa hè.',
    tip: 'Chảo cần đủ nóng và rau thật ráo để rau xanh, giòn, không ra nhiều nước.',
    tags: ['10 phút', 'món rau', 'cơm nhà'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/cac-mon-an-ngon-de-lam-tai-nha/',
  },
  {
    slug: 'dau-hu-sot-ca-chua',
    name: 'Đậu hũ sốt cà chua',
    excerpt: 'Đậu hũ mềm béo trong xốt cà chua dịu, nguyên liệu bình dân và hợp cả bữa chay.',
    image: tomatoTofuImage,
    imageAlt: 'Đĩa đậu hũ vàng sốt cà chua và hành lá',
    imageCredit: 'Mickey Đại Phát / Wikimedia Commons',
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Tomato-sauced_tofu.jpg',
    imageLicense: 'CC BY-SA 4.0',
    imageKind: 'licensed',
    region: 'Ba miền',
    category: 'Món chay',
    difficulty: 'Dễ',
    prepMinutes: 8,
    cookMinutes: 15,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu',
        items: [
          { name: 'Đậu hũ trắng', amount: 4, unit: 'miếng' },
          { name: 'Cà chua', amount: 4, unit: 'quả' },
          { name: 'Hành lá', amount: 2, unit: 'nhánh' },
          { name: 'Nước mắm chay, đường và tiêu', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Rửa nhanh đậu hũ, thấm khô kỹ rồi cắt mỗi miếng thành 4–6 phần. Bề mặt khô giúp đậu ít bắn dầu và lên màu đẹp.',
      'Cà chua bỏ cuống, bổ múi cau; băm nhỏ một nửa để xốt nhanh sánh, giữ nửa còn lại nguyên miếng để món có kết cấu.',
      'Thái riêng đầu hành trắng và lá hành. Pha nước mắm chay với đường và 100 ml nước ấm.',
    ],
    cooking: [
      'Cho dầu vào chảo, áp chảo đậu trên lửa vừa đến khi các mặt vàng nhạt. Không chiên quá giòn; gắp ra giấy thấm dầu.',
      'Giữ lại khoảng một muỗng canh dầu, phi đầu hành rồi cho phần cà chua băm vào. Thêm một nhúm muối và dằm đến khi thành xốt.',
      'Cho phần cà chua múi cùng hỗn hợp gia vị vào, đun 2 phút. Xếp đậu vào chảo, rưới xốt lên từng miếng.',
      'Rim lửa nhỏ 5–7 phút, trở nhẹ một lần để đậu thấm đều. Khi xốt sánh vừa, thêm hành lá và tiêu rồi tắt bếp.',
    ],
    serving: 'Rắc hành lá, dùng với cơm nóng và rau luộc.',
    tip: 'Áp chảo đậu vừa vàng giúp miếng đậu đứng dáng mà bên trong vẫn mềm.',
    tags: ['món chay', 'tiết kiệm', 'dễ nấu'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/cac-mon-an-ngon-de-lam-tai-nha/',
  },
  {
    slug: 'canh-bi-do-thit-bam',
    name: 'Canh bí đỏ thịt băm',
    excerpt: 'Canh có vị ngọt bùi, màu vàng ấm và đủ nhẹ nhàng cho bữa cơm ngày thường.',
    image: familyMealImage,
    imageAlt: 'Mâm cơm nhà với canh bí đỏ',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Ba miền',
    category: 'Món canh',
    difficulty: 'Dễ',
    prepMinutes: 10,
    cookMinutes: 20,
    servings: 4,
    ingredients: [
      {
        group: 'Nguyên liệu',
        items: [
          { name: 'Bí đỏ', amount: 500, unit: 'g' },
          { name: 'Thịt heo băm', amount: 150, unit: 'g' },
          { name: 'Hành tím', amount: 1, unit: 'củ' },
          { name: 'Hành lá, muối và tiêu', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Gọt vỏ bí, nạo sạch hạt và phần xơ, rửa rồi cắt miếng dày 2–3 cm. Cắt đều để các miếng chín cùng lúc.',
      'Ướp thịt băm 10 phút với hành tím băm, chút nước mắm và tiêu. Hành lá rửa sạch, cắt riêng đầu hành và lá.',
      'Chuẩn bị 1–1,2 lít nước nóng; nếu thích canh ngọt hơn có thể dùng nước luộc gà nhạt.',
    ],
    cooking: [
      'Phi đầu hành với ít dầu, cho thịt băm vào đảo tơi đến khi vừa đổi màu. Không xào quá lâu để thịt không khô.',
      'Thêm nước nóng, đun sôi và hớt bọt. Cho bí vào, hạ lửa vừa và nấu không đậy kín vung khoảng 10–12 phút.',
      'Kiểm tra bằng cách xiên đũa: bí mềm nhưng chưa vỡ là đạt. Nêm muối và nước mắm vừa ăn.',
      'Cho hành lá, một ít tiêu rồi tắt bếp. Múc nhẹ tay để miếng bí còn nguyên và nước canh trong.',
    ],
    serving: 'Dùng nóng cùng món mặn có vị đậm vừa phải.',
    tip: 'Không khuấy nhiều khi bí đã mềm để nước canh trong và miếng bí nguyên vẹn.',
    tags: ['món canh', 'dễ nấu', 'ngày thường'],
    sourceName: 'Cookpad',
    sourceUrl: 'https://cookpad.com/vn/cong-thuc/254021',
    status: 'draft',
  },
  {
    slug: 'bun-cha-ha-noi',
    name: 'Bún chả Hà Nội',
    excerpt: 'Chả nướng thơm, nước chấm chua ngọt và rổ rau tươi cho bữa cuối tuần đổi vị.',
    image: bunChaImage,
    imageAlt: 'Bún chả Hà Nội với thịt nướng và rau tươi',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Bắc',
    category: 'Món nước',
    difficulty: 'Vừa',
    prepMinutes: 35,
    cookMinutes: 25,
    servings: 4,
    ingredients: [
      {
        group: 'Phần chả',
        items: [
          { name: 'Bún tươi', amount: 800, unit: 'g' },
          { name: 'Thịt vai và ba chỉ', amount: 700, unit: 'g' },
          { name: 'Hành tím băm', amount: 3, unit: 'muỗng canh' },
          { name: 'Rau sống', amount: 400, unit: 'g' },
        ],
      },
      {
        group: 'Nước chấm và dưa góp',
        items: [
          { name: 'Nước mắm', amount: 5, unit: 'muỗng canh' },
          { name: 'Giấm gạo', amount: 4, unit: 'muỗng canh' },
          { name: 'Đường', amount: 4, unit: 'muỗng canh' },
          { name: 'Đu đủ xanh và cà rốt', amount: 250, unit: 'g' },
          { name: 'Tỏi, ớt, tiêu', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Thịt ba chỉ thái lát mỏng; thịt vai băm hoặc xay thô rồi nặn thành miếng dẹt. Ướp hai phần thịt riêng với hành tím, nước mắm, đường, tiêu và chút dầu trong ít nhất 30 phút.',
      'Đu đủ xanh và cà rốt thái mỏng, bóp nhẹ với muối, rửa lại rồi ngâm 15 phút trong hỗn hợp giấm-đường để làm dưa góp.',
      'Rau sống nhặt kỹ, rửa sạch và để ráo. Trụng nhanh bún bằng nước ấm nếu bún lạnh hoặc bị dính.',
    ],
    cooking: [
      'Xếp thịt lên vỉ, nướng trên than hoặc nồi chiên ở 190°C. Trở mặt sau 6–8 phút và nướng đến khi cạnh thịt xém nhẹ nhưng bên trong còn mọng.',
      'Đun ấm hỗn hợp nước, nước mắm, đường và giấm; nếm theo thứ tự mặn dịu, chua nhẹ rồi ngọt hậu. Tắt bếp mới thêm tỏi, ớt.',
      'Chia dưa góp vào bát, thêm nước chấm ấm rồi thả chả miếng và thịt nướng vào ngay trước khi ăn.',
    ],
    serving: 'Ăn kèm bún tươi và rau sống, chấm từng đũa vừa miệng.',
    tip: 'Nướng hai lượt lửa và quét mỏng dầu giúp thịt thơm mà không khô.',
    tags: ['cuối tuần', 'Hà Nội', 'món nước'],
    sourceName: 'Cookpad',
    sourceUrl: 'https://cookpad.com/vn/tim-kiem/b%C3%BAn%20ch%E1%BA%A3%20h%C3%A0%20n%E1%BB%99i',
  },
  {
    slug: 'pho-ga-gia-dinh',
    name: 'Phở gà gia đình',
    excerpt: 'Nước dùng trong, thơm gừng hành; một lựa chọn ấm bụng cho sáng cuối tuần.',
    image: phoImage,
    imageAlt: 'Bát phở gà nóng với hành và rau thơm',
    imageCredit: 'Ảnh minh họa chân thật được tạo riêng cho Bếp Việt',
    imageKind: 'project',
    region: 'Bắc',
    category: 'Món nước',
    difficulty: 'Vừa',
    prepMinutes: 25,
    cookMinutes: 55,
    servings: 4,
    ingredients: [
      {
        group: 'Nước dùng và thịt',
        items: [
          { name: 'Gà ta', amount: 1.2, unit: 'kg' },
          { name: 'Gừng', amount: 40, unit: 'g' },
          { name: 'Hành tây', amount: 1, unit: 'củ' },
          { name: 'Hành tím', amount: 4, unit: 'củ' },
          { name: 'Hoa hồi và hạt mùi', amount: null, unit: 'một ít', scalable: false },
        ],
      },
      {
        group: 'Phần ăn kèm',
        items: [
          { name: 'Bánh phở', amount: 700, unit: 'g' },
          { name: 'Hành lá và rau mùi', amount: 100, unit: 'g' },
          { name: 'Chanh và ớt', amount: null, unit: 'vừa đủ', scalable: false },
          { name: 'Nước mắm, muối, đường phèn', amount: null, unit: 'vừa đủ', scalable: false },
        ],
      },
    ],
    preparation: [
      'Xát gà với muối và gừng đập dập, rửa sạch cả trong lẫn ngoài. Buộc gọn chân cánh để gà chín đều và không rách da.',
      'Nướng hành tây, hành tím và gừng đến khi thơm, cạo bỏ phần cháy đen. Rang nhanh hoa hồi và hạt mùi trên chảo khô rồi cho vào túi lọc.',
      'Hành lá, rau mùi rửa sạch; chẻ phần đầu hành, thái nhỏ phần lá. Bánh phở tách nhẹ để khi chần không vón.',
    ],
    cooking: [
      'Cho gà vào nồi, thêm nước lạnh ngập gà và một ít muối. Đun đến khi vừa sôi thì hạ lửa, hớt bọt thật kỹ.',
      'Thêm hành gừng nướng và túi gia vị. Luộc lăn tăn 25–30 phút, tắt bếp và ngâm gà thêm 10 phút trước khi vớt ra.',
      'Ngâm gà chín vào nước nguội 2 phút cho da săn, để ráo rồi lọc thịt, thái hoặc xé vừa ăn. Cho xương trở lại nồi ninh thêm 20 phút.',
      'Lọc nước dùng, nêm nước mắm, muối và một ít đường phèn cho vị thanh. Chần bánh phở 10–15 giây, xếp thịt gà, hành rồi chan nước dùng đang sôi.',
    ],
    serving: 'Thêm hành, rau thơm, chanh và ớt theo khẩu vị.',
    tip: 'Chỉ để nước sôi lăn tăn trong lúc luộc để gà mềm và nước dùng trong.',
    tags: ['cuối tuần', 'món nước', 'miền Bắc'],
    sourceName: 'Món Ngon Mỗi Ngày',
    sourceUrl: 'https://monngonmoingay.com/pho-ga/',
  },
];

type EditedImage = { src: string; srcSet: string; master: string; alt: string };

function applyEditedImage(recipe: Recipe): Recipe {
  const image = (editedImages as Record<string, EditedImage>)[recipe.slug];
  if (!image) return recipe;
  return {
    ...recipe,
    image: image.src,
    imageSrcSet: image.srcSet,
    imageMaster: image.master,
    imageAlt: image.alt,
    imageKind: 'project',
    imageCredit: 'Ảnh minh họa của Bếp Việt được biên tập bởi tác giả',
    imageCreditUrl: undefined,
    imageLicense: undefined,
  };
}

export let recipes = recipeCatalog
  .filter((recipe) => recipe.status !== 'draft')
  .map(applyEditedImage);

export function replaceRecipeCatalog(catalog: Recipe[]) {
  const order = new Map(recipes.map((recipe, index) => [recipe.slug, index]));
  recipes = catalog
    .map(applyEditedImage)
    .sort((a, b) => (order.get(a.slug) ?? 1000) - (order.get(b.slug) ?? 1000));
}

export function recipeMinutes(recipe: Recipe) {
  return recipe.prepMinutes + recipe.cookMinutes + (recipe.passiveMinutes ?? 0);
}

type FormatText = (text: string, vars?: Record<string, string | number>) => string;

const fillTemplate: FormatText = (text, vars) =>
  text.replace(/\{(\w+)\}/g, (match, key: string) =>
    vars && key in vars ? String(vars[key]) : match,
  );

/** Định dạng thời lượng; truyền hàm dịch `t` để hiển thị theo ngôn ngữ đang chọn. */
export function formatMinutes(minutes: number, t: FormatText = fillTemplate) {
  if (minutes < 60) return t('{count} phút', { count: minutes });
  if (minutes >= 1440 && minutes % 1440 === 0) return t('{count} ngày', { count: minutes / 1440 });
  const remainder = minutes % 60;
  const hours = t('{count} giờ', { count: Math.floor(minutes / 60) });
  return remainder ? `${hours} ${t('{count} phút', { count: remainder })}` : hours;
}

export function ingredientAmount(item: Ingredient, recipe: Recipe, servings: number) {
  if (item.amount == null || item.scalable === false || item.scalingRule === 'vessel_dependent')
    return item.amount;
  let factor = servings / recipe.servings;
  if (item.scalingRule === 'taste_adjusted' && recipe.scalingTargets?.length) {
    const points = [
      { servings: 0, seasoning_start_factor: 0 },
      { servings: recipe.servings, seasoning_start_factor: 1 },
      ...recipe.scalingTargets,
    ].sort((a, b) => a.servings - b.servings);
    const upperIndex = points.findIndex((point) => point.servings >= servings);
    const upper = points[upperIndex > 0 ? upperIndex : points.length - 1]!;
    const lower = points[upperIndex > 0 ? upperIndex - 1 : points.length - 2]!;
    factor =
      lower.seasoning_start_factor +
      ((servings - lower.servings) / (upper.servings - lower.servings)) *
        (upper.seasoning_start_factor - lower.seasoning_start_factor);
  }
  return item.amount * factor;
}

export const mealSets = [
  {
    id: 'mam-com-ngay-thuong',
    title: 'Mâm cơm ngày thường dễ nấu',
    description: 'Đủ món mặn, canh và rau; hoàn thành trong khoảng 45 phút.',
    time: '45 phút',
    minutes: 45,
    servings: 4,
    recipeSlugs: ['ca-chep-kho-rieng', 'canh-chua-ca', 'rau-muong-xao-toi'],
  },
  {
    id: 'mam-com-tre-nho',
    title: 'Mâm cơm cả nhà đều thích',
    description: 'Hương vị dịu, nhiều màu sắc và dễ ăn cho gia đình có trẻ nhỏ.',
    time: '40 phút',
    minutes: 40,
    servings: 4,
    recipeSlugs: ['suon-xao-chua-ngot', 'trung-chien-rau-cu', 'dau-hu-sot-ca-chua'],
  },
  {
    id: 'mam-com-thanh-mat',
    title: 'Mâm cơm thanh mát ngày nóng',
    description: 'Canh chua cân vị cùng đậu hũ và rau xanh nhẹ bụng.',
    time: '35 phút',
    minutes: 35,
    servings: 4,
    recipeSlugs: ['canh-chua-ca', 'dau-hu-sot-ca-chua', 'rau-muong-xao-toi'],
  },
];

export function getRecipe(slug: string) {
  return recipes.find((recipe) => recipe.slug === slug);
}

export function getMealRecipes(slugs: string[]) {
  return slugs.map(getRecipe).filter((recipe): recipe is Recipe => Boolean(recipe));
}
