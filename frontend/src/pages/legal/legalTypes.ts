/** Khối nội dung của văn bản pháp lý: đoạn văn hoặc danh sách gạch đầu dòng. */
export type LegalBlock = string | { list: string[] };

export interface LegalSection {
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDocumentContent {
  title: string;
  summary: string;
  effectiveLabel: string;
  versionLabel: string;
  tocLabel: string;
  sections: LegalSection[];
}

/** Đổi phiên bản mỗi khi nội dung thay đổi đáng kể; ngày hiệu lực do chủ sản phẩm điền. */
export const LEGAL_VERSION = '1.1';
export const LEGAL_EFFECTIVE_DATE = {
  vi: '24/11/2026',
  en: 'November 24, 2026',
} as const;
