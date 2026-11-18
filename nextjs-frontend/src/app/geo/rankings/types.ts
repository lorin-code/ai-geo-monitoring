export type MetricKey = 'brand_mention_rate' | 'avg_share_of_voice' | 'citation_rate' | 'recommendation_rate' | 'avg_brand_rank';
export type SortOrder = 'asc' | 'desc';
export type MetricOption = { value: MetricKey; label: string; default_order: SortOrder; unit: string };
export type BrandOption = { id: number; name: string; industry?: string; platforms: string[] };
export type RankingFilters = { project_ids: number[]; days: number; platform: string; metric: MetricKey; order: SortOrder };
export type RankingRow = {
  project_id: number;
  name: string;
  rank: number | null;
  checks: number;
  metrics: Record<MetricKey, number | null>;
  generated: boolean;
  status: 'ranked' | 'no_data' | 'error';
  reason: string | null;
  report: { id: number; created_at: string; period_start: string; period_end: string } | null;
};
export type RankingResult = {
  filters: RankingFilters;
  calculated_at: string;
  generated_count: number;
  ranked_count: number;
  rows: RankingRow[];
};
