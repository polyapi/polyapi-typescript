interface ProjectTemplate {
  name: string;
  typescript?: string;
  java?: string;
  python?: string;
}

export interface ProjectTemplatesConfig {
  templates: ProjectTemplate[];
}

export interface ProjectTemplatesConfigVariable {
  value: ProjectTemplatesConfig
}