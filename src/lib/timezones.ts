/** City → IANA timezone (matches dashboard-modals.js CITY_TIMEZONE exactly) */
export const CITY_TIMEZONE: Record<string, string> = {
  "Albuquerque, NM": "America/Denver",
  "Atlanta, GA": "America/New_York",
  "Austin, TX": "America/Chicago",
  "Baltimore, MD": "America/New_York",
  "Boston, MA": "America/New_York",
  "Charlotte, NC": "America/New_York",
  "Chicago, IL": "America/Chicago",
  "Colorado Springs, CO": "America/Denver",
  "Columbus, OH": "America/New_York",
  "Dallas, TX": "America/Chicago",
  "Denver, CO": "America/Denver",
  "Detroit, MI": "America/Detroit",
  "El Paso, TX": "America/Denver",
  "Fort Worth, TX": "America/Chicago",
  "Fresno, CA": "America/Los_Angeles",
  "Honolulu, HI": "Pacific/Honolulu",
  "Houston, TX": "America/Chicago",
  "Indianapolis, IN": "America/Indiana/Indianapolis",
  "Jacksonville, FL": "America/New_York",
  "Kansas City, MO": "America/Chicago",
  "Las Vegas, NV": "America/Los_Angeles",
  "Long Beach, CA": "America/Los_Angeles",
  "Los Angeles, CA": "America/Los_Angeles",
  "Louisville, KY": "America/Kentucky/Louisville",
  "Memphis, TN": "America/Chicago",
  "Mesa, AZ": "America/Phoenix",
  "Miami, FL": "America/New_York",
  "Milwaukee, WI": "America/Chicago",
  "Minneapolis, MN": "America/Chicago",
  "Nashville, TN": "America/Chicago",
  "New Orleans, LA": "America/Chicago",
  "New York, NY": "America/New_York",
  "Oakland, CA": "America/Los_Angeles",
  "Oklahoma City, OK": "America/Chicago",
  "Omaha, NE": "America/Chicago",
  "Philadelphia, PA": "America/New_York",
  "Phoenix, AZ": "America/Phoenix",
  "Portland, OR": "America/Los_Angeles",
  "Raleigh, NC": "America/New_York",
  "Sacramento, CA": "America/Los_Angeles",
  "San Antonio, TX": "America/Chicago",
  "San Diego, CA": "America/Los_Angeles",
  "San Francisco, CA": "America/Los_Angeles",
  "San Jose, CA": "America/Los_Angeles",
  "Seattle, WA": "America/Los_Angeles",
  "Tampa, FL": "America/New_York",
  "Tucson, AZ": "America/Phoenix",
  "Tulsa, OK": "America/Chicago",
  "Virginia Beach, VA": "America/New_York",
  "Washington, DC": "America/New_York",
};

/** IANA timezone → canonical city name */
export const TIMEZONE_CITY: Record<string, string> = {
  "America/New_York": "New York, NY",
  "America/Chicago": "Chicago, IL",
  "America/Denver": "Denver, CO",
  "America/Los_Angeles": "Los Angeles, CA",
  "America/Phoenix": "Phoenix, AZ",
  "America/Detroit": "Detroit, MI",
  "America/Indiana/Indianapolis": "Indianapolis, IN",
  "America/Kentucky/Louisville": "Louisville, KY",
  "Pacific/Honolulu": "Honolulu, HI",
};

export const CITIES = Object.keys(CITY_TIMEZONE).sort();

/** Is this branch currently open, given its businessHours and timezone? */
export function isBranchOpen(
  timezone: string,
  hours: { day_of_week: number; open_time: string; closed_time: string }[]
): boolean {
  if (!hours.length) return false;
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone || "UTC",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? "0");
    const h = get("hour") % 24;
    const m = get("minute");
    const dow = (new Date(get("year"), get("month") - 1, get("day")).getDay() + 6) % 7;
    const cur = h * 60 + m;
    return hours.some((bh) => {
      if (bh.day_of_week !== dow) return false;
      const [oH, oM] = (bh.open_time || "00:00").split(":").map(Number);
      const [cH, cM] = (bh.closed_time || "00:00").split(":").map(Number);
      return cur >= oH * 60 + oM && cur < cH * 60 + cM;
    });
  } catch { return false; }
}
