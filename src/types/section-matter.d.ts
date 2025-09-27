/**
 * Type declarations for section-matter package
 */

declare module 'section-matter' {
  export interface Section {
    key: string;
    content: string;
    data?: unknown;
  }

  export interface ParsedContent {
    content: string;
    sections: Section[];
  }

  export interface SectionMatterOptions {
    section_delimiter?: string;
    parse?: (section: Section, sections: Section[]) => void;
  }

  function sectionMatter(input: string, options?: SectionMatterOptions): ParsedContent;
  export = sectionMatter;
}