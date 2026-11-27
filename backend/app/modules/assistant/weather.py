"""Thời tiết hiện tại cho Chú Rồng (Open-Meteo, miễn phí, không cần khóa) + gợi ý món hợp trời.

Gọi mạng có thời gian chờ ngắn và bộ nhớ đệm theo thành phố; lỗi mạng không bao giờ làm hỏng
câu trả lời: Chú Rồng nói thật là chưa lấy được số liệu rồi vẫn gợi ý món theo bữa.
"""

from __future__ import annotations

import logging
import random
import re
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from app.modules.assistant import engine
from app.modules.assistant.phrases import Language
from app.modules.recipes.search import normalize_search

logger = logging.getLogger(__name__)

GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search"
FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Dự phòng khi Open-Meteo lỗi hoặc hết hạn mức theo IP (IP dùng chung của nhà mạng/máy chủ).
WTTR_URL = "https://wttr.in/{lat},{lon}"
# Mã thời tiết WWO (wttr.in) quy về mã WMO mà phần diễn giải đang dùng.
_WWO_TO_WMO = {
    113: 0, 116: 2, 119: 3, 122: 3, 143: 45, 248: 45, 260: 45,
    176: 61, 263: 51, 266: 51, 293: 61, 296: 61, 353: 80,
    299: 63, 302: 63, 305: 65, 308: 65, 356: 81, 359: 82,
    200: 95, 386: 95, 389: 95, 392: 95,
}
TIMEOUT_SECONDS = 3.0
CACHE_SECONDS = 600.0
MAX_CACHE = 200


@dataclass(frozen=True, slots=True)
class Place:
    name: str
    latitude: float
    longitude: float


HANOI = Place("Hà Nội", 21.0285, 105.8542)
# Tọa độ sẵn cho thành phố hay được hỏi: khỏi gọi geocoding, trả lời nhanh hơn.
_KNOWN: tuple[tuple[Place, tuple[str, ...]], ...] = (
    (HANOI, ("ha noi", "hanoi", "thu do")),
    (
        Place("TP. Hồ Chí Minh", 10.8231, 106.6297),
        ("ho chi minh", "tp hcm", "tphcm", "hcm", "sai gon", "saigon", "ho chi minh city"),
    ),
    (Place("Đà Nẵng", 16.0544, 108.2022), ("da nang", "danang")),
    (Place("Huế", 16.4637, 107.5909), ("hue", "thua thien hue")),
    (Place("Hải Phòng", 20.8449, 106.6881), ("hai phong",)),
    (Place("Cần Thơ", 10.0452, 105.7469), ("can tho",)),
    (Place("Nha Trang", 12.2388, 109.1967), ("nha trang", "khanh hoa")),
    (Place("Đà Lạt", 11.9404, 108.4583), ("da lat", "dalat", "lam dong")),
    (Place("Vũng Tàu", 10.3460, 107.0843), ("vung tau",)),
    (Place("Quy Nhơn", 13.7820, 109.2197), ("quy nhon", "binh dinh")),
    (Place("Hạ Long", 20.9599, 107.0425), ("ha long", "quang ninh")),
    (Place("Sa Pa", 22.3364, 103.8438), ("sa pa", "sapa", "lao cai")),
    (Place("Hội An", 15.8801, 108.3380), ("hoi an",)),
    (Place("Phú Quốc", 10.2899, 103.9840), ("phu quoc",)),
    (Place("Buôn Ma Thuột", 12.6667, 108.0500), ("buon ma thuot", "dak lak")),
    (Place("Thanh Hóa", 19.8067, 105.7852), ("thanh hoa",)),
    (Place("Nam Định", 20.4388, 106.1621), ("nam dinh",)),
    (Place("Ninh Bình", 20.2506, 105.9745), ("ninh binh",)),
    (Place("Bắc Ninh", 21.1861, 106.0763), ("bac ninh",)),
    (Place("Biên Hòa", 10.9574, 106.8427), ("bien hoa", "dong nai")),
)

_STRONG = (
    "thoi tiet",
    "du bao",
    "nhiet do",
    "bao nhieu do",
    "weather",
    "forecast",
    "temperature",
    "raining",
    "is it rain",
    "will it rain",
)
_RAIN = re.compile(
    r"(?:^| )(?:troi|co|dang|sap|se|bi) mua"
    r"(?=$| (?:khong|ko|chua|roi|to|nho|nhieu|lon|nhi|a|vay|ha|phun|rao|da)(?: |$))"
)
_HEAT = re.compile(r"(?:^| )(?:nong|lanh|ret|nang|oi buc|mat me|am ap|mat)(?: |$)")
_QUESTION = re.compile(r"(?:^| )(?:khong|ko|chua|the nao|ra sao|bao nhieu|nhi|a|ha)(?: |$)")
_WHEN = re.compile(
    r"(?:^| )(?:troi|ngoai troi|hom nay|ngay mai|bay gio|luc nay|sang nay|chieu nay|toi nay)(?: |$)"
)
_ENGLISH = re.compile(
    r"(?:^| )(?:is it|will it be|how) (?:hot|cold|sunny|rainy|warm)(?: |$)"
    r"|(?:^| )(?:hot|cold|rainy|sunny) (?:today|outside|now)(?: |$)"
)


def _known_place(text: str) -> Place | None:
    for place, aliases in _KNOWN:
        if any(re.search(rf"(?:^| ){re.escape(alias)}(?: |$)", text) for alias in aliases):
            return place
    return None


def detect(message: str) -> bool:
    """Câu *hỏi* thời tiết ("Hà Nội có mưa không", "trời Sài Gòn nóng không").

    Câu kể ("trời lạnh quá, ăn gì?") vẫn để bộ máy gợi ý món theo vị xử lý như cũ.
    """
    text = normalize_search(message)
    if not text:
        return False
    if any(re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", text) for phrase in _STRONG):
        return True
    if _ENGLISH.search(text):
        return True
    asks = "?" in message or bool(_QUESTION.search(text))
    context = bool(_WHEN.search(text)) or _known_place(text) is not None
    return asks and context and bool(_RAIN.search(text) or _HEAT.search(text))


_PLACE_AFTER = re.compile(
    r"(?:^|\s)(?:ở|tại|o|tai|in|at)\s+([^\s,?.!]+(?:\s+[^\s,?.!]+){0,2})", re.I
)
_PLACE_STOP = {
    normalize_search(word)
    for words in (
        "hôm nay ngày mai bây giờ thế nào ra sao có không ko nóng lạnh rét mưa nắng trời",
        "thời tiết đang sẽ nhỉ vậy ạ nhé đâu today now tomorrow the weather like is it hot cold",
    )
    for word in words.split()
}


def find_place(message: str) -> tuple[Place | None, str | None]:
    """(địa điểm đã biết, tên lạ cần tra geocoding). Cả hai None nghĩa là dùng mặc định."""
    known = _known_place(normalize_search(message))
    if known is not None:
        return known, None
    match = _PLACE_AFTER.search(message)
    if match:
        words: list[str] = []
        for word in match.group(1).split():
            if normalize_search(word) in _PLACE_STOP:
                break
            words.append(word)
        name = " ".join(words).strip()
        if len(name) >= 2:
            return None, name
    return None, None


# ---------------------------------------------------------------------------
# Gọi Open-Meteo có bộ nhớ đệm.
# ---------------------------------------------------------------------------
_lock = threading.Lock()
_forecast_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
_geocode_cache: dict[str, tuple[float, Place | None]] = {}


def reset_cache() -> None:
    with _lock:
        _forecast_cache.clear()
        _geocode_cache.clear()


def _get_json(url: str, params: dict[str, Any]) -> dict[str, Any] | None:
    try:
        response = httpx.get(url, params=params, timeout=TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Open-Meteo request failed (%s).", type(exc).__name__)
        return None
    return data if isinstance(data, dict) else None


def _float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _wttr_forecast(place: Place) -> dict[str, Any] | None:
    """Lấy số liệu từ wttr.in và đổi về đúng cấu trúc của Open-Meteo."""
    raw = _get_json(WTTR_URL.format(lat=place.latitude, lon=place.longitude), {"format": "j1"})
    try:
        current = (raw or {})["current_condition"][0]
        today = (raw or {})["weather"][0]
    except (KeyError, IndexError, TypeError):
        return None
    code = _float(current.get("weatherCode"))
    rain_chances = [_float(hour.get("chanceofrain")) for hour in today.get("hourly", [])]
    return {
        "current": {
            "temperature_2m": _float(current.get("temp_C")),
            "apparent_temperature": _float(current.get("FeelsLikeC")),
            "relative_humidity_2m": _float(current.get("humidity")),
            "precipitation": _float(current.get("precipMM")),
            "weather_code": _WWO_TO_WMO.get(int(code), 3) if code is not None else None,
            "wind_speed_10m": _float(current.get("windspeedKmph")),
        },
        "daily": {
            "temperature_2m_max": [_float(today.get("maxtempC"))],
            "temperature_2m_min": [_float(today.get("mintempC"))],
            "precipitation_probability_max": [
                max((value for value in rain_chances if value is not None), default=None)
            ],
        },
        "source": "wttr.in",
    }


def _trim(cache: dict[Any, Any]) -> None:
    if len(cache) > MAX_CACHE:
        for key in list(cache)[: len(cache) - MAX_CACHE]:
            cache.pop(key, None)


def geocode(name: str, *, now: float | None = None) -> Place | None:
    key = normalize_search(name)
    now = time.monotonic() if now is None else now
    with _lock:
        cached = _geocode_cache.get(key)
    if cached and now - cached[0] < CACHE_SECONDS * 6:
        return cached[1]
    data = _get_json(GEOCODE_URL, {"name": name, "count": 1, "language": "vi", "format": "json"})
    if data is None:
        return None  # Lỗi mạng: không lưu đệm để lần sau thử lại.
    results = data.get("results") or []
    place: Place | None = None
    if results and isinstance(results[0], dict):
        first = results[0]
        try:
            place = Place(
                str(first.get("name") or name), float(first["latitude"]), float(first["longitude"])
            )
        except (KeyError, TypeError, ValueError):
            place = None
    with _lock:
        _geocode_cache[key] = (now, place)
        _trim(_geocode_cache)
    return place


def forecast(place: Place, *, now: float | None = None) -> dict[str, Any] | None:
    key = (round(place.latitude, 2), round(place.longitude, 2))
    now = time.monotonic() if now is None else now
    with _lock:
        cached = _forecast_cache.get(key)
    if cached and now - cached[0] < CACHE_SECONDS:
        return cached[1]
    data = _get_json(
        FORECAST_URL,
        {
            "latitude": place.latitude,
            "longitude": place.longitude,
            "current": "temperature_2m,apparent_temperature,relative_humidity_2m,"
            "precipitation,weather_code,wind_speed_10m",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
            "timezone": "Asia/Ho_Chi_Minh",
            "forecast_days": 1,
        },
    )
    if data is None or not isinstance(data.get("current"), dict):
        data = _wttr_forecast(place)
    if data is None:
        return None
    with _lock:
        _forecast_cache[key] = (now, data)
        _trim(_forecast_cache)
    return data


# ---------------------------------------------------------------------------
# Diễn giải số liệu.
# ---------------------------------------------------------------------------
_WMO: dict[int, tuple[str, str]] = {
    0: ("trời quang", "clear sky"),
    1: ("trời gần như quang", "mainly clear"),
    2: ("có mây rải rác", "partly cloudy"),
    3: ("nhiều mây, u ám", "overcast"),
    45: ("có sương mù", "fog"),
    48: ("sương mù đóng băng", "depositing rime fog"),
    51: ("mưa phùn nhẹ", "light drizzle"),
    53: ("mưa phùn", "drizzle"),
    55: ("mưa phùn dày", "dense drizzle"),
    56: ("mưa phùn lạnh", "freezing drizzle"),
    57: ("mưa phùn lạnh dày", "dense freezing drizzle"),
    61: ("mưa nhỏ", "light rain"),
    63: ("mưa vừa", "moderate rain"),
    65: ("mưa to", "heavy rain"),
    66: ("mưa lạnh", "freezing rain"),
    67: ("mưa lạnh nặng hạt", "heavy freezing rain"),
    71: ("tuyết rơi nhẹ", "light snow"),
    73: ("tuyết rơi", "snow"),
    75: ("tuyết rơi dày", "heavy snow"),
    77: ("mưa tuyết hạt nhỏ", "snow grains"),
    80: ("mưa rào nhẹ", "light showers"),
    81: ("mưa rào", "rain showers"),
    82: ("mưa rào rất to", "violent showers"),
    85: ("mưa tuyết rào nhẹ", "light snow showers"),
    86: ("mưa tuyết rào", "snow showers"),
    95: ("có dông", "thunderstorm"),
    96: ("dông kèm mưa đá nhỏ", "thunderstorm with hail"),
    99: ("dông kèm mưa đá", "thunderstorm with heavy hail"),
}
_RAIN_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99}


def describe_code(code: int | None, language: Language = "vi") -> str:
    vi, en = _WMO.get(code if code is not None else -1, ("thời tiết thay đổi", "mixed weather"))
    return vi if language == "vi" else en


@dataclass(frozen=True, slots=True)
class Report:
    place: Place
    temperature: float | None
    feels_like: float | None
    humidity: float | None
    precipitation: float | None
    code: int | None
    wind: float | None
    t_max: float | None
    t_min: float | None
    rain_chance: float | None
    observed: str = ""
    source: str = "Open-Meteo"

    @property
    def mood(self) -> str:
        """"rain" | "hot" | "cold" | "mild": quyết định kiểu món nên gợi ý."""
        if (self.code in _RAIN_CODES) or (self.precipitation or 0) >= 0.3:
            return "rain"
        temp = self.temperature if self.temperature is not None else 26.0
        feels = self.feels_like if self.feels_like is not None else temp
        if temp >= 32 or feels >= 34:
            return "hot"
        if temp <= 18 or feels <= 17:
            return "cold"
        return "mild"


def _num(block: dict[str, Any], key: str) -> float | None:
    value = block.get(key)
    if isinstance(value, list):
        value = value[0] if value else None
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def parse_report(place: Place, data: dict[str, Any]) -> Report | None:
    current = data.get("current")
    if not isinstance(current, dict):
        return None
    raw_daily = data.get("daily")
    daily: dict[str, Any] = raw_daily if isinstance(raw_daily, dict) else {}
    code = _num(current, "weather_code")
    observed = str(current.get("time") or "")
    return Report(
        place=place,
        temperature=_num(current, "temperature_2m"),
        feels_like=_num(current, "apparent_temperature"),
        humidity=_num(current, "relative_humidity_2m"),
        precipitation=_num(current, "precipitation"),
        code=int(code) if code is not None else None,
        wind=_num(current, "wind_speed_10m"),
        t_max=_num(daily, "temperature_2m_max"),
        t_min=_num(daily, "temperature_2m_min"),
        rain_chance=_num(daily, "precipitation_probability_max"),
        observed=observed[-5:] if len(observed) >= 5 else "",
        source=str(data.get("source") or "Open-Meteo"),
    )


@dataclass(frozen=True, slots=True)
class Lookup:
    report: Report | None
    place: Place
    unknown: str | None = None  # Tên địa điểm người dùng gõ nhưng không tra ra.


def lookup(message: str) -> Lookup:
    place, unknown = find_place(message)
    missing: str | None = None
    if place is None and unknown:
        place = geocode(unknown)
        if place is None:
            missing = unknown
    place = place or HANOI
    data = forecast(place)
    report = parse_report(place, data) if data else None
    return Lookup(report=report, place=place, unknown=missing)


def _deg(value: float | None) -> str:
    return f"{round(value)}°C" if value is not None else "?"


def facts(report: Report, language: Language = "vi") -> str:
    desc = describe_code(report.code, language)
    at = f" lúc {report.observed}" if report.observed and language == "vi" else ""
    if language == "en":
        at = f" at {report.observed}" if report.observed else ""
        parts = [f"**Weather in {report.place.name}{at}**: {desc}, {_deg(report.temperature)}"]
        if report.feels_like is not None:
            parts.append(f"(feels like {_deg(report.feels_like)})")
        extra = []
        if report.humidity is not None:
            extra.append(f"humidity {round(report.humidity)}%")
        if report.wind is not None:
            extra.append(f"wind {round(report.wind)} km/h")
        line = " ".join(parts) + (", " + ", ".join(extra) if extra else "") + "."
        if report.t_min is not None and report.t_max is not None:
            line += f" Today {_deg(report.t_min)}–{_deg(report.t_max)}"
            if report.rain_chance is not None:
                line += f", {round(report.rain_chance)}% chance of rain"
            line += "."
        return line
    parts = [f"**Thời tiết {report.place.name}{at}**: {desc}, {_deg(report.temperature)}"]
    if report.feels_like is not None:
        parts.append(f"(cảm giác như {_deg(report.feels_like)})")
    extra = []
    if report.humidity is not None:
        extra.append(f"độ ẩm {round(report.humidity)}%")
    if report.wind is not None:
        extra.append(f"gió {round(report.wind)} km/h")
    line = " ".join(parts) + (", " + ", ".join(extra) if extra else "") + "."
    if report.t_min is not None and report.t_max is not None:
        line += f" Cả ngày {_deg(report.t_min)}–{_deg(report.t_max)}"
        if report.rain_chance is not None:
            line += f", khả năng mưa {round(report.rain_chance)}%"
        line += "."
    return line


# ---------------------------------------------------------------------------
# Món hợp thời tiết.
# ---------------------------------------------------------------------------
_MOOD_WORDS: dict[str, tuple[str, ...]] = {
    "hot": (
        "goi", "nom", "canh chua", "canh", "che", "sinh to", "nuoc ep", "rau", "dua", "bi",
        "muop", "cai", "salad", "cuon", "bun", "thach", "suong sao", "dau xanh", "mat",
    ),
    "rain": (
        "lau", "chao", "pho", "bun bo", "kho", "ham", "nuong", "chien", "sup", "mien",
        "hu tieu", "rang", "gung", "nong",
    ),
    "cold": (
        "lau", "chao", "pho", "kho", "ham", "nuong", "gung", "bun bo", "sup", "mien",
        "chien", "rang", "tieu", "nong",
    ),
}
_MOOD_LINE: dict[str, dict[Language, str]] = {
    "hot": {
        "vi": "Trời nóng thì ăn món thanh mát, nhiều rau và nước cho dễ chịu nhé.",
        "en": "It's hot, so light, cooling dishes with plenty of veg work best.",
    },
    "rain": {
        "vi": "Trời mưa ăn món nóng hổi, có nước dùng ấm bụng là nhất.",
        "en": "Rainy weather calls for something hot and comforting.",
    },
    "cold": {
        "vi": "Trời lạnh nên chọn món nóng, đậm đà, có gừng tiêu cho ấm người.",
        "en": "It's chilly — warm, hearty dishes with ginger or pepper are ideal.",
    },
    "mild": {
        "vi": "Trời dễ chịu, ăn gì cũng hợp, mình chọn mấy món hợp bữa này nè.",
        "en": "Pleasant weather — here are a few dishes for this meal.",
    },
}


def _score(entry: engine.RecipeEntry, mood: str) -> int:
    words = _MOOD_WORDS.get(mood, ())
    name = f" {entry.name_norm} "
    score = sum(2 for word in words if f" {word} " in name)
    if mood == "hot" and entry.category in ("Món canh", "Món tráng miệng", "Món rau"):
        score += 1
    if mood in ("rain", "cold") and ({"kho", "nau"} & set(entry.methods)):
        score += 1
    if mood in ("rain", "cold") and entry.category in ("Món nước", "Món canh"):
        score += 1
    return score


def pick_for_weather(
    message: str,
    mood: str,
    catalog: list[engine.RecipeEntry],
    *,
    preferences: engine.Preferences | None = None,
    avoid: set[str] | None = None,
    now: datetime | None = None,
    limit: int = 3,
    rng: random.Random | None = None,
) -> list[engine.RecipeEntry]:
    """Món hợp trời, vẫn tôn trọng điều kiện trong câu (món chay, kiêng…) và ghi nhớ."""
    rng = rng or random.Random()
    intent = engine.apply_preferences(engine.parse_intent(message, catalog), preferences)
    # Tên thành phố trong câu hỏi thời tiết không có nghĩa là muốn món của miền đó.
    intent.regions = set()
    intent.include = []
    if intent.meal is None:
        intent.meal = engine.current_meal(now)
    pool, _ = engine.pick_recipes(intent, catalog, avoid=avoid, limit=60, rng=rng)
    pool = [entry for entry in pool if engine.allowed(entry, preferences)]
    ranked = sorted(pool, key=lambda entry: _score(entry, mood), reverse=True)
    best = [entry for entry in ranked if _score(entry, mood) > 0][: limit * 3]
    rng.shuffle(best)
    picks = best[:limit]
    picks += [entry for entry in ranked if entry not in picks][: limit - len(picks)]
    return picks


@dataclass(slots=True)
class WeatherReply:
    content: str
    recipes: list[engine.RecipeEntry]
    context: str  # Số liệu thật đưa cho AI, để AI không tự bịa thời tiết.
    ok: bool


def reply(
    message: str,
    catalog: list[engine.RecipeEntry],
    *,
    language: Language = "vi",
    preferences: engine.Preferences | None = None,
    avoid: set[str] | None = None,
    now: datetime | None = None,
    rng: random.Random | None = None,
) -> WeatherReply:
    found = lookup(message)
    report = found.report
    mood = report.mood if report else "mild"
    picks = pick_for_weather(
        message, mood, catalog, preferences=preferences, avoid=avoid, now=now, rng=rng
    )
    names = ", ".join(f"**{entry.name}**" for entry in picks)
    lines: list[str] = []
    if found.unknown:
        lines.append(
            f"Mình chưa tìm thấy địa điểm “{found.unknown}”, nên xem tạm {found.place.name} nhé."
            if language == "vi"
            else f"I couldn't find “{found.unknown}”, so here is {found.place.name} instead."
        )
    if report is not None:
        lines.append(facts(report, language))
        label = "Gợi ý" if language == "vi" else "Try"
        lines.append(_MOOD_LINE[mood][language] + (f" {label}: {names}." if names else ""))
        lines.append(
            f"_Nguồn: {report.source}_" if language == "vi" else f"_Source: {report.source}_"
        )
        context = (
            f"<thoi_tiet>Số liệu thật từ {report.source} "
            "(chỉ dùng đúng số liệu này, không tự thêm): "
            + facts(report, "vi").replace("**", "")
            + f" Kiểu trời: {mood}. Hãy gợi ý món trong danh sách món phù hợp kiểu trời này."
            + "</thoi_tiet>"
        )
    else:
        lines.append(
            "Mình chưa lấy được số liệu thời tiết lúc này (dịch vụ thời tiết đang chậm), "
            "bạn xem nhanh trên điện thoại giúp mình nhé."
            if language == "vi"
            else "I couldn't reach the weather service just now — please check your phone."
        )
        if names:
            lines.append(
                f"Còn món thì mình gợi ý theo bữa này: {names}."
                if language == "vi"
                else f"Meanwhile, for this meal: {names}."
            )
        context = (
            "<thoi_tiet>Không lấy được số liệu thời tiết. Nói rõ là chưa xem được thời tiết, "
            "tuyệt đối không đoán nhiệt độ hay mưa nắng.</thoi_tiet>"
        )
    return WeatherReply(
        content="\n\n".join(lines), recipes=picks, context=context, ok=report is not None
    )
