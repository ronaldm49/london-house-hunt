import { AreaConfig } from "@/types/property";

/**
 * Predefined London areas with their Rightmove region codes and OnTheMarket URL slugs.
 * Rightmove codes: verified against the Rightmove search API (locationIdentifier param).
 * OTM slugs: the URL path segment used in /to-rent/property/{slug}/.
 *
 * Note: "Angel" uses the Barnsbury (N1) code — Angel has no dedicated Rightmove region.
 */
export const LONDON_AREAS: AreaConfig[] = [
  { name: "Angel", rightmove_code: "REGION^85330", otm_slug: "angel" },
  { name: "Archway", rightmove_code: "REGION^93727", otm_slug: "archway" },
  { name: "Balham", rightmove_code: "REGION^85434", otm_slug: "balham" },
  { name: "Battersea", rightmove_code: "REGION^87492", otm_slug: "battersea" },
  { name: "Bermondsey", rightmove_code: "REGION^85212", otm_slug: "bermondsey" },
  { name: "Bethnal Green", rightmove_code: "REGION^85224", otm_slug: "bethnal-green" },
  { name: "Bow", rightmove_code: "REGION^87495", otm_slug: "bow" },
  { name: "Brixton", rightmove_code: "REGION^87496", otm_slug: "brixton" },
  { name: "Camden", rightmove_code: "REGION^93941", otm_slug: "camden" },
  { name: "Canada Water", rightmove_code: "REGION^93754", otm_slug: "canada-water" },
  { name: "Canonbury", rightmove_code: "REGION^85331", otm_slug: "canonbury" },
  { name: "Chiswick", rightmove_code: "REGION^85345", otm_slug: "chiswick" },
  { name: "Clapham", rightmove_code: "REGION^85282", otm_slug: "clapham" },
  { name: "Crouch End", rightmove_code: "REGION^85322", otm_slug: "crouch-end" },
  { name: "Dalston", rightmove_code: "REGION^85389", otm_slug: "dalston" },
  { name: "Deptford", rightmove_code: "REGION^85450", otm_slug: "deptford" },
  { name: "East Dulwich", rightmove_code: "REGION^70441", otm_slug: "east-dulwich" },
  { name: "Finsbury Park", rightmove_code: "REGION^85353", otm_slug: "finsbury-park" },
  { name: "Greenwich", rightmove_code: "REGION^85358", otm_slug: "greenwich" },
  { name: "Hackney", rightmove_code: "REGION^87508", otm_slug: "hackney" },
  { name: "Hammersmith", rightmove_code: "REGION^85329", otm_slug: "hammersmith" },
  { name: "Herne Hill", rightmove_code: "REGION^85409", otm_slug: "herne-hill" },
  { name: "Highbury", rightmove_code: "REGION^70438", otm_slug: "highbury" },
  { name: "Highgate", rightmove_code: "REGION^70315", otm_slug: "highgate" },
  { name: "Holloway", rightmove_code: "REGION^87514", otm_slug: "holloway" },
  { name: "Homerton", rightmove_code: "REGION^70408", otm_slug: "homerton" },
  { name: "Islington", rightmove_code: "REGION^93965", otm_slug: "islington" },
  { name: "Kennington", rightmove_code: "REGION^70435", otm_slug: "kennington" },
  { name: "Kentish Town", rightmove_code: "REGION^85230", otm_slug: "kentish-town" },
  { name: "Muswell Hill", rightmove_code: "REGION^85376", otm_slug: "muswell-hill" },
  { name: "New Cross", rightmove_code: "REGION^85384", otm_slug: "new-cross" },
  { name: "Notting Hill", rightmove_code: "REGION^70331", otm_slug: "notting-hill" },
  { name: "Peckham", rightmove_code: "REGION^85428", otm_slug: "peckham" },
  { name: "Shepherd's Bush", rightmove_code: "REGION^85398", otm_slug: "shepherds-bush" },
  { name: "Shoreditch", rightmove_code: "REGION^87528", otm_slug: "shoreditch" },
  { name: "Stockwell", rightmove_code: "REGION^85369", otm_slug: "stockwell" },
  { name: "Stoke Newington", rightmove_code: "REGION^85413", otm_slug: "stoke-newington" },
  { name: "Stratford", rightmove_code: "REGION^85312", otm_slug: "stratford" },
  { name: "Streatham", rightmove_code: "REGION^87530", otm_slug: "streatham" },
  { name: "Tooting", rightmove_code: "REGION^85419", otm_slug: "tooting" },
  { name: "Tufnell Park", rightmove_code: "REGION^85222", otm_slug: "tufnell-park" },
  { name: "Vauxhall", rightmove_code: "REGION^70424", otm_slug: "vauxhall" },
  { name: "Wandsworth", rightmove_code: "REGION^87535", otm_slug: "wandsworth" },
];
