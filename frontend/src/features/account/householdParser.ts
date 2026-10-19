import type { HouseholdMember } from '@/features/auth/types';

interface RoleRule {
  words: string[];
  label: string;
  age: number;
}

// Cụm hai từ được xét trước từ đơn ("bạn nhỏ" trước "bạn", "em bé" trước "em").
const ROLE_RULES: RoleRule[] = [
  { words: ['bạn', 'nhỏ'], label: 'Bé', age: 8 },
  { words: ['con', 'nhỏ'], label: 'Bé', age: 8 },
  { words: ['em', 'bé'], label: 'Bé', age: 3 },
  { words: ['bé'], label: 'Bé', age: 8 },
  { words: ['ông'], label: 'Ông', age: 70 },
  { words: ['bà'], label: 'Bà', age: 67 },
  { words: ['bố'], label: 'Bố', age: 40 },
  { words: ['ba'], label: 'Bố', age: 40 },
  { words: ['cha'], label: 'Bố', age: 40 },
  { words: ['mẹ'], label: 'Mẹ', age: 38 },
  { words: ['má'], label: 'Mẹ', age: 38 },
  { words: ['vợ'], label: 'Vợ', age: 32 },
  { words: ['chồng'], label: 'Chồng', age: 34 },
  { words: ['anh'], label: 'Anh', age: 30 },
  { words: ['chị'], label: 'Chị', age: 28 },
  { words: ['em'], label: 'Em', age: 20 },
  { words: ['con'], label: 'Con', age: 10 },
  { words: ['cháu'], label: 'Cháu', age: 10 },
  { words: ['tôi'], label: 'Tôi', age: 28 },
  { words: ['mình'], label: 'Tôi', age: 28 },
];

const TOTAL_WORDS = new Set(['người', 'thành', 'suất']);
const MAX_MEMBERS = 12;

interface Role {
  label: string;
  age: number;
  start: number;
  end: number;
  hasAge: boolean;
}

function tokenize(raw: string) {
  return raw
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .replace(/(\d)([^\d\s])/gu, '$1 $2')
    .replace(/([^\d\s])(\d)/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function matchRole(tokens: string[], index: number) {
  return ROLE_RULES.find((rule) =>
    rule.words.every((word, offset) => tokens[index + offset] === word),
  );
}

/** Tạo bản nháp thành viên gia đình từ mô tả tự do. */
export function parseHouseholdDescription(raw: string): HouseholdMember[] {
  const tokens = tokenize(raw);
  const roles: Role[] = [];
  const ages: { value: number; index: number }[] = [];
  let total = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (/^\d+$/.test(token)) {
      const value = Number(token);
      const next = tokens[index + 1] ?? '';
      if (TOTAL_WORDS.has(next)) {
        total = Math.max(total, value);
      } else if (matchRole(tokens, index + 1)) {
        // “2 bố mẹ”, “3 con”: số lượng của các vai trò ngay phía sau.
        let cursor = index + 1;
        const listed: Role[] = [];
        let rule = matchRole(tokens, cursor);
        while (rule && listed.length < value) {
          listed.push({
            label: rule.label,
            age: rule.age,
            start: cursor,
            end: cursor + rule.words.length - 1,
            hasAge: false,
          });
          cursor += rule.words.length;
          rule = matchRole(tokens, cursor);
        }
        const template = listed.at(-1)!;
        while (listed.length < Math.min(value, MAX_MEMBERS)) listed.push({ ...template });
        roles.push(...listed);
        index = cursor - 1;
      } else if (value <= 110) {
        ages.push({ value, index });
      }
      continue;
    }
    const rule = matchRole(tokens, index);
    if (rule) {
      roles.push({
        label: rule.label,
        age: rule.age,
        start: index,
        end: index + rule.words.length - 1,
        hasAge: false,
      });
      index += rule.words.length - 1;
    }
  }

  const unassigned: number[] = [];
  for (const age of ages) {
    const adjacent = roles.find((role) => role.end === age.index - 1 && !role.hasAge);
    const target = adjacent ?? roles.find((role) => role.start < age.index && !role.hasAge);
    if (target) {
      target.age = age.value;
      target.hasAge = true;
    } else {
      unassigned.push(age.value);
    }
  }

  const members: HouseholdMember[] = roles
    .slice(0, MAX_MEMBERS)
    .map((role) => ({ label: role.label, age: role.age, appetite: 'normal' }));
  const target = Math.min(MAX_MEMBERS, Math.max(total, members.length, unassigned.length));
  while (members.length < target) {
    members.push({
      label: `Thành viên ${members.length + 1}`,
      age: unassigned.shift() ?? 30,
      appetite: 'normal',
    });
  }
  return members;
}
