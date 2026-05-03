#!/usr/bin/env python3

import json
import os
import posixpath
import re
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


HOST = "0.0.0.0"
PORT = 3000
ROOT = Path(__file__).resolve().parent

def load_dotenv(path):
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv(ROOT / ".env")


NAVER_CLIENT_ID = os.environ.get("NAVER_CLIENT_ID", "")
NAVER_CLIENT_SECRET = os.environ.get("NAVER_CLIENT_SECRET", "")
NAVER_GEOCODE_URL = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode"
NAVER_LOCAL_CLIENT_ID = os.environ.get("NAVER_LOCAL_CLIENT_ID", "")
NAVER_LOCAL_CLIENT_SECRET = os.environ.get("NAVER_LOCAL_CLIENT_SECRET", "")
NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
SEOUL_SUBWAY_SEARCH_KEY = os.environ.get("SEOUL_SUBWAY_SEARCH_KEY", "")
SEOUL_SUBWAY_ARRIVAL_KEY = os.environ.get("SEOUL_SUBWAY_ARRIVAL_KEY", SEOUL_SUBWAY_SEARCH_KEY)
SEOUL_SUBWAY_POSITION_KEY = os.environ.get("SEOUL_SUBWAY_POSITION_KEY", "")
SEOUL_SUBWAY_CONFUSION_KEY = os.environ.get("SEOUL_SUBWAY_CONFUSION_KEY", "")
SEOUL_SUBWAY_DAILY_RIDERS_KEY = os.environ.get("SEOUL_SUBWAY_DAILY_RIDERS_KEY", "")
SEOUL_SUBWAY_TIME_RIDERS_KEY = os.environ.get("SEOUL_SUBWAY_TIME_RIDERS_KEY", "")
SEOUL_BUS_DAILY_RIDERS_KEY = os.environ.get("SEOUL_BUS_DAILY_RIDERS_KEY", "")
SEOUL_BUS_TIME_RIDERS_KEY = os.environ.get("SEOUL_BUS_TIME_RIDERS_KEY", "")
SEOUL_OPENAPI_BASE = "http://openapi.seoul.go.kr:8088"
SEOUL_SUBWAY_REALTIME_BASE = "http://swopenapi.seoul.go.kr/api/subway"
SEOUL_TRANSIT_ROUTE_KEY = os.environ.get("SEOUL_TRANSIT_ROUTE_KEY", "")
SEOUL_BUS_REALTIME_KEY = os.environ.get("SEOUL_BUS_REALTIME_KEY", SEOUL_TRANSIT_ROUTE_KEY)
SEOUL_TRANSIT_ROUTE_BASE = "http://ws.bus.go.kr/api/rest/pathinfo"
SUBWAY_RIDER_CACHE = {}


class StrangeMapHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        trailing_slash = path.rstrip().endswith("/")
        path = posixpath.normpath(urllib.parse.unquote(path))
        words = [word for word in path.split("/") if word]

        resolved = ROOT
        for word in words:
            resolved = resolved / word

        if trailing_slash:
            resolved = resolved / ""

        return str(resolved)

    def end_json(self, status_code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/api/geocode":
            return self.handle_geocode(parsed)
        if parsed.path == "/api/naver-map-script":
            return self.handle_naver_map_script()
        if parsed.path == "/api/seoul-events":
            return self.handle_seoul_events()
        if parsed.path == "/api/subway/realtime":
            return self.handle_subway_realtime(parsed)
        if parsed.path == "/api/subway/congestion":
            return self.handle_subway_congestion(parsed)
        if parsed.path == "/api/subway/segment-shape":
            return self.handle_subway_segment_shape(parsed)
        if parsed.path == "/api/bus/realtime":
            return self.handle_bus_realtime(parsed)
        if parsed.path == "/api/bus/congestion":
            return self.handle_bus_congestion(parsed)
        if parsed.path == "/api/bus/segment-shape":
            return self.handle_bus_segment_shape(parsed)
        if parsed.path == "/api/transit/subway-route":
            return self.handle_transit_route(parsed, "getPathInfoBySubway")
        if parsed.path == "/api/transit/bus-route":
            return self.handle_transit_route(parsed, "getPathInfoByBus")
        if parsed.path == "/api/transit/mixed-route":
            return self.handle_transit_route(parsed, "getPathInfoByBusNSub")

        return super().do_GET()

    def handle_naver_map_script(self):
        if not NAVER_CLIENT_ID:
            return self.end_json(500, {"error": "Missing NAVER_CLIENT_ID"})
        script_url = "https://oapi.map.naver.com/openapi/v3/maps.js?" + urllib.parse.urlencode(
            {"ncpKeyId": NAVER_CLIENT_ID}
        )
        request = urllib.request.Request(script_url, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                body = response.read()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            return self.end_json(502, {"error": "NAVER_MAP_SCRIPT_ERROR", "message": str(exc)})

    def handle_seoul_events(self):
        event_key = os.environ.get("SEOUL_EVENT_KEY", "")
        if not event_key:
            return self.end_json(500, {"error": "Missing SEOUL_EVENT_KEY"})
        url = f"{SEOUL_OPENAPI_BASE}/{event_key}/json/culturalEventInfo/1/120/"
        try:
            return self.end_json(200, self.fetch_json(url))
        except Exception as exc:
            return self.end_json(502, {"error": "SEOUL_EVENTS_ERROR", "message": str(exc)})

    def handle_geocode(self, parsed):
        query_params = urllib.parse.parse_qs(parsed.query)
        query = (query_params.get("q", [""])[0] or "").strip()

        if not query:
            return self.end_json(400, {"error": "Missing q parameter"})

        addresses = []
        errors = []

        if self.is_station_query(query):
            try:
                subway_payload = self.fetch_subway_station_locations(query)
                addresses.extend(subway_payload.get("addresses", []))
            except urllib.error.HTTPError as exc:
                errors.append(
                    {
                        "source": "seoulSubwayStation",
                        "status": exc.code,
                        "message": exc.read().decode("utf-8", errors="replace"),
                    }
                )
            except Exception as exc:
                errors.append({"source": "seoulSubwayStation", "message": str(exc)})

        fetchers = [
            ("naverLocalPlace", self.fetch_naver_local_places),
            ("naverGeocode", self.fetch_naver_geocode),
            ("seoulTransitLocation", self.fetch_transit_locations),
            ("nominatim", self.fetch_nominatim_geocode),
        ]

        for source, fetcher in fetchers:
            try:
                payload = fetcher(query)
                addresses.extend(payload.get("addresses", []))
            except urllib.error.HTTPError as exc:
                errors.append(
                    {
                        "source": source,
                        "status": exc.code,
                        "message": exc.read().decode("utf-8", errors="replace"),
                    }
                )
            except Exception as exc:
                errors.append({"source": source, "message": str(exc)})

        return self.end_json(
            200,
            {
                "status": "OK",
                "source": "combined",
                "addresses": self.dedupe_addresses(addresses),
                "errors": errors,
                "placeSearchEnabled": bool(NAVER_LOCAL_CLIENT_ID and NAVER_LOCAL_CLIENT_SECRET),
            },
        )

    def is_station_query(self, query):
        normalized = self.normalize_station_name(query)
        return "역" in str(query or "") or len(normalized) <= 4

    def fetch_subway_station_locations(self, query):
        station_name = self.normalize_station_name(query)
        data = self.fetch_json(
            f"{SEOUL_OPENAPI_BASE}/{SEOUL_SUBWAY_SEARCH_KEY}/json/"
            f"SearchInfoBySubwayNameService/1/20/{urllib.parse.quote(station_name)}"
        )
        rows = data.get("SearchInfoBySubwayNameService", {}).get("row", []) or []
        addresses = []

        for row in rows:
            row_station = self.normalize_station_name(self.row_text(row, ["STATION_NM", "STTN_NM"]))
            if row_station != station_name:
                continue

            line_name = self.row_text(row, ["LINE_NUM"])
            coord = self.lookup_station_coord(row_station, line_name)
            if not coord:
                continue

            addresses.append(
                {
                    "x": coord["lng"],
                    "y": coord["lat"],
                    "placeName": row_station + "역",
                    "roadAddress": f"{line_name} {row_station}역",
                    "jibunAddress": f"{line_name} {row_station}역",
                    "category": "교통,수송>지하철,전철역",
                    "stationCode": self.row_text(row, ["STATION_CD", "FR_CODE"]),
                    "lineName": line_name,
                    "source": "seoulSubwayStation",
                }
            )

        return {"status": "OK", "source": "seoulSubwayStation", "addresses": addresses}

    def dedupe_addresses(self, addresses):
        unique = []
        seen = set()

        for item in addresses:
            lng = str(item.get("x") or "").strip()
            lat = str(item.get("y") or "").strip()
            label = item.get("placeName") or item.get("roadAddress") or item.get("jibunAddress") or ""
            key = f"{label}|{lat[:12]}|{lng[:12]}"

            if not lng or not lat or key in seen:
                continue

            seen.add(key)
            unique.append(item)

        return unique[:12]

    def fetch_naver_geocode(self, query):
        target = NAVER_GEOCODE_URL + "?" + urllib.parse.urlencode({"query": query})
        request = urllib.request.Request(
            target,
            headers={
                "x-ncp-apigw-api-key-id": NAVER_CLIENT_ID,
                "x-ncp-apigw-api-key": NAVER_CLIENT_SECRET,
                "Accept": "application/json",
            },
            method="GET",
        )

        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace").strip()
            if not body:
                return {"status": "EMPTY", "addresses": []}
            return json.loads(body)

    def fetch_naver_local_places(self, query):
        if not NAVER_LOCAL_CLIENT_ID or not NAVER_LOCAL_CLIENT_SECRET:
            return {"status": "DISABLED", "addresses": []}

        target = NAVER_LOCAL_SEARCH_URL + "?" + urllib.parse.urlencode(
            {"query": query, "display": 8, "start": 1, "sort": "comment"}
        )
        request = urllib.request.Request(
            target,
            headers={
                "X-Naver-Client-Id": NAVER_LOCAL_CLIENT_ID,
                "X-Naver-Client-Secret": NAVER_LOCAL_CLIENT_SECRET,
                "Accept": "application/json",
            },
            method="GET",
        )

        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace").strip()
            if not body:
                return {"status": "EMPTY", "addresses": []}

        payload = json.loads(body)
        addresses = []
        for item in payload.get("items", []):
            lng = self.naver_local_coord(item.get("mapx"))
            lat = self.naver_local_coord(item.get("mapy"))

            if not lng or not lat:
                address_query = item.get("roadAddress") or item.get("address") or self.clean_html(item.get("title"))
                geocoded = self.fetch_naver_geocode(address_query)
                geocode_item = (geocoded.get("addresses") or [{}])[0]
                lng = geocode_item.get("x")
                lat = geocode_item.get("y")

            if not lng or not lat:
                continue

            addresses.append(
                {
                    "x": lng,
                    "y": lat,
                    "placeName": self.clean_html(item.get("title")),
                    "roadAddress": item.get("roadAddress") or geocode_item.get("roadAddress"),
                    "jibunAddress": item.get("address") or geocode_item.get("jibunAddress"),
                    "category": item.get("category"),
                    "telephone": item.get("telephone"),
                    "link": item.get("link"),
                    "source": "naverLocalPlace",
                }
            )

        return {"status": "OK", "source": "naverLocalPlace", "addresses": addresses}

    def naver_local_coord(self, value):
        try:
            return str(float(value) / 10000000)
        except (TypeError, ValueError):
            return ""

    def clean_html(self, value):
        return re.sub(r"<[^>]+>", "", value or "").strip()

    def fetch_nominatim_geocode(self, query):
        target = NOMINATIM_URL + "?" + urllib.parse.urlencode(
            {"format": "jsonv2", "limit": 5, "q": query}
        )
        request = urllib.request.Request(
            target,
            headers={
                "Accept": "application/json",
                "User-Agent": "StrangeMapDemo/1.0",
            },
            method="GET",
        )

        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace")
            items = json.loads(body)
            return {
                "status": "OK",
                "source": "nominatim",
                "addresses": [
                    {
                        "x": item.get("lon"),
                        "y": item.get("lat"),
                        "roadAddress": item.get("display_name"),
                        "jibunAddress": item.get("display_name"),
                    }
                    for item in items
                ],
            }

    def fetch_transit_locations(self, query):
        target = (
            f"{SEOUL_TRANSIT_ROUTE_BASE}/getLocationInfo?"
            + urllib.parse.urlencode({"ServiceKey": SEOUL_TRANSIT_ROUTE_KEY, "stSrch": query})
        )
        request = urllib.request.Request(target, headers={"Accept": "application/xml"}, method="GET")

        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace")

        root = ET.fromstring(body)
        addresses = []
        for item in root.findall("./msgBody/itemList"):
            name = self.node_text(item, "poiNm")
            lng = self.node_text(item, "gpsX")
            lat = self.node_text(item, "gpsY")
            if lng and lat:
                addresses.append(
                    {
                        "x": lng,
                        "y": lat,
                        "roadAddress": name,
                        "jibunAddress": name,
                        "source": "seoulTransitLocation",
                    }
                )

        return {"status": "OK", "source": "seoulTransitLocation", "addresses": addresses}

    def handle_subway_realtime(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        station_name = (params.get("station", [""])[0] or "").strip()
        line_code = (params.get("lineCode", [""])[0] or "").strip()
        line_name = (params.get("lineName", [""])[0] or "").strip()

        if not station_name:
            return self.end_json(400, {"error": "Missing station parameter"})

        try:
            search_data = self.fetch_json(
                f"{SEOUL_OPENAPI_BASE}/{SEOUL_SUBWAY_SEARCH_KEY}/json/"
                f"SearchInfoBySubwayNameService/1/20/{urllib.parse.quote(station_name)}"
            )
            arrival_data = self.fetch_json(
                f"{SEOUL_SUBWAY_REALTIME_BASE}/{SEOUL_SUBWAY_ARRIVAL_KEY}/json/"
                f"realtimeStationArrival/0/20/{urllib.parse.quote(station_name)}"
            )

            positions = {"realtimePositionList": []}
            if line_name:
                positions = self.fetch_json(
                    f"{SEOUL_SUBWAY_REALTIME_BASE}/{SEOUL_SUBWAY_POSITION_KEY}/json/"
                    f"realtimePosition/0/200/{urllib.parse.quote(line_name)}"
                )

            search_rows = search_data.get("SearchInfoBySubwayNameService", {}).get("row", []) or []
            arrivals = arrival_data.get("realtimeArrivalList", []) or []
            position_rows = positions.get("realtimePositionList", []) or []

            if line_code:
                arrivals = [item for item in arrivals if item.get("subwayId") == line_code]
                search_rows = [
                    item for item in search_rows if self.normalize_line_num(item.get("LINE_NUM")) == line_name
                ] or search_rows

            enriched_arrivals = []
            for item in arrivals[:4]:
                matched_position = next(
                    (
                        pos
                        for pos in position_rows
                        if pos.get("trainNo") == item.get("btrainNo") or pos.get("trainNo") == item.get("trainNo")
                    ),
                    None,
                )
                enriched_arrivals.append(
                    {
                        "subwayId": item.get("subwayId"),
                        "updnLine": item.get("updnLine"),
                        "trainLineNm": item.get("trainLineNm"),
                        "arvlMsg2": item.get("arvlMsg2"),
                        "arvlMsg3": item.get("arvlMsg3"),
                        "barvlDt": item.get("barvlDt"),
                        "btrainNo": item.get("btrainNo"),
                        "bstatnNm": item.get("bstatnNm"),
                        "recptnDt": item.get("recptnDt"),
                        "position": matched_position,
                    }
                )

            return self.end_json(
                200,
                {
                    "station": station_name,
                    "lineCode": line_code,
                    "lineName": line_name,
                    "searchRows": search_rows,
                    "arrivals": enriched_arrivals,
                },
            )
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return self.end_json(
                exc.code,
                {"error": "SUBWAY_REALTIME_HTTP_ERROR", "status": exc.code, "body": body},
            )
        except Exception as exc:
            return self.end_json(502, {"error": "SUBWAY_REALTIME_ERROR", "message": str(exc)})

    def handle_subway_congestion(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        station_name = self.normalize_station_name((params.get("station", [""])[0] or "").strip())
        line_name = (params.get("lineName", [""])[0] or "").strip()
        from_id = (params.get("fromId", [""])[0] or "").strip()
        to_id = (params.get("toId", [""])[0] or "").strip()
        from_name = self.normalize_station_name((params.get("fromName", [""])[0] or "").strip())
        to_name = self.normalize_station_name((params.get("toName", [""])[0] or "").strip())
        expected_count = self.to_int((params.get("railLinkCount", [""])[0] or "").strip())

        if not station_name:
            return self.end_json(400, {"error": "Missing station parameter"})

        try:
            direction_label = self.infer_subway_direction_label(
                line_name, from_id, to_id, from_name, to_name, expected_count
            )
            official_result = self.calculate_subway_confusion_congestion(station_name, line_name, direction_label)
            if official_result.get("status") == "OK":
                return self.end_json(200, official_result)

            daily_payload = self.fetch_latest_subway_daily_rows()
            time_payload = self.fetch_subway_time_rows(self.latest_subway_time_month())
            result = self.calculate_subway_congestion(daily_payload, time_payload, station_name, line_name)
            return self.end_json(200, result)
        except Exception as exc:
            return self.end_json(502, {"error": "SUBWAY_CONGESTION_ERROR", "message": str(exc)})

    def handle_subway_segment_shape(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        from_id = (params.get("fromId", [""])[0] or "").strip()
        to_id = (params.get("toId", [""])[0] or "").strip()
        from_name = self.normalize_station_name((params.get("fromName", [""])[0] or "").strip())
        to_name = self.normalize_station_name((params.get("toName", [""])[0] or "").strip())
        line_name = (params.get("lineName", [""])[0] or "").strip()
        expected_count = self.to_int((params.get("railLinkCount", [""])[0] or "").strip())

        if not from_id or not to_id or not line_name:
            return self.end_json(400, {"error": "Missing subway shape parameters"})

        try:
            stations = self.fetch_subway_line_stations(line_name)
            segment = self.slice_subway_segment(stations, from_id, to_id, from_name, to_name, expected_count)
            return self.end_json(
                200,
                {
                    "status": "OK",
                    "lineName": line_name,
                    "points": segment,
                    "source": "SearchSTNBySubwayLineInfo+naverLocalPlace",
                },
            )
        except Exception as exc:
            return self.end_json(502, {"error": "SUBWAY_SEGMENT_SHAPE_ERROR", "message": str(exc)})

    def fetch_subway_line_stations(self, line_name):
        cache_key = f"subway-line:{line_name}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        url = (
            f"{SEOUL_OPENAPI_BASE}/{SEOUL_SUBWAY_SEARCH_KEY}/json/"
            f"SearchSTNBySubwayLineInfo/1/1000//{urllib.parse.quote(line_name)}"
        )
        data = self.fetch_json(url)
        rows = data.get("SearchSTNBySubwayLineInfo", {}).get("row", []) or []
        normalized_line = self.normalize_line_name(line_name)
        stations = []

        for row in rows:
            row_line = self.normalize_line_name(row.get("LINE_NUM"))
            if row_line != normalized_line:
                continue
            station_name = self.normalize_station_name(row.get("STATION_NM"))
            station_code = str(row.get("STATION_CD") or "").strip()
            if normalized_line == "2호선" and self.to_int(station_code) > 243:
                continue
            coord = self.lookup_station_coord(station_name, line_name)
            if coord:
                stations.append(
                    {
                        "id": station_code.zfill(4),
                        "name": station_name,
                        "lat": coord["lat"],
                        "lng": coord["lng"],
                    }
                )

        stations.sort(key=lambda item: self.to_int(item["id"]))
        SUBWAY_RIDER_CACHE[cache_key] = stations
        return stations

    def lookup_station_coord(self, station_name, line_name):
        cache_key = f"station-coord:{line_name}:{station_name}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        queries = [f"{station_name}역 {line_name}", f"{station_name}역"]
        for query in queries:
            try:
                places = self.fetch_naver_local_places(query).get("addresses", [])
                station_place = next(
                    (
                        item
                        for item in places
                        if self.normalize_station_name(item.get("placeName")) == station_name
                        and (
                            "지하철" in str(item.get("category") or "")
                            or "역" in str(item.get("placeName") or "")
                        )
                    ),
                    None,
                )
                if station_place:
                    coord = {
                        "lat": self.to_float(station_place.get("y")),
                        "lng": self.to_float(station_place.get("x")),
                    }
                    if coord["lat"] and coord["lng"]:
                        SUBWAY_RIDER_CACHE[cache_key] = coord
                        return coord
            except Exception:
                continue

        return None

    def slice_subway_segment(self, stations, from_id, to_id, from_name, to_name, expected_count):
        from_code = self.short_station_code(from_id)
        to_code = self.short_station_code(to_id)
        from_index = self.find_station_index(stations, from_code, from_name)
        to_index = self.find_station_index(stations, to_code, to_name)

        if from_index is None or to_index is None:
            return []

        forward = self.circular_slice(stations, from_index, to_index)
        backward = self.circular_slice(stations, to_index, from_index)
        backward = list(reversed(backward))

        candidates = [forward, backward]
        if expected_count > 0:
            selected = min(candidates, key=lambda items: abs((len(items) - 1) - expected_count))
        else:
            selected = min(candidates, key=len)

        return selected

    def short_station_code(self, value):
        digits = re.sub(r"\D", "", str(value or ""))
        if len(digits) >= 3:
            return digits[-3:]
        return digits

    def find_station_index(self, stations, short_code, station_name):
        for index, station in enumerate(stations):
            if self.short_station_code(station["id"]) == short_code:
                return index

        normalized_name = self.normalize_station_name(station_name)
        for index, station in enumerate(stations):
            if self.normalize_station_name(station["name"]) == normalized_name:
                return index

        return None

    def circular_slice(self, items, start, end):
        if start <= end:
            return items[start : end + 1]
        return items[start:] + items[: end + 1]

    def fetch_latest_subway_daily_rows(self):
        cache_key = "daily:latest"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        start_date = date.today() - timedelta(days=3)
        for offset in range(0, 21):
            target_date = (start_date - timedelta(days=offset)).strftime("%Y%m%d")
            payload = self.fetch_subway_daily_rows(target_date)
            if payload["rows"]:
                SUBWAY_RIDER_CACHE[cache_key] = payload
                return payload

        return {"date": "", "rows": []}

    def fetch_subway_daily_rows(self, target_date):
        url = (
            f"{SEOUL_OPENAPI_BASE}/{SEOUL_SUBWAY_DAILY_RIDERS_KEY}/json/"
            f"CardSubwayStatsNew/1/1000/{target_date}"
        )
        data = self.fetch_json(url)
        body = data.get("CardSubwayStatsNew", {})
        return {"date": target_date, "rows": body.get("row", []) or []}

    def latest_subway_time_month(self):
        today = date.today()
        year = today.year
        month = today.month - 1
        if month == 0:
            year -= 1
            month = 12
        return f"{year}{month:02d}"

    def fetch_subway_time_rows(self, month):
        cache_key = f"time:{month}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        rows = []
        start = 1
        while start <= 3000:
            end = start + 999
            url = (
                f"{SEOUL_OPENAPI_BASE}/{SEOUL_SUBWAY_TIME_RIDERS_KEY}/json/"
                f"CardSubwayTime/{start}/{end}/{month}"
            )
            data = self.fetch_json(url)
            body = data.get("CardSubwayTime", {})
            page_rows = body.get("row", []) or []
            rows.extend(page_rows)
            total = int(body.get("list_total_count") or len(rows))
            if end >= total or not page_rows:
                break
            start = end + 1

        payload = {"month": month, "rows": rows}
        SUBWAY_RIDER_CACHE[cache_key] = payload
        return payload

    def fetch_subway_confusion_rows(self):
        cache_key = "subway-confusion:rows"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        rows = []
        start = 1
        total = None
        while total is None or start <= total:
            end = start + 999
            url = (
                f"{SEOUL_OPENAPI_BASE}/{SEOUL_SUBWAY_CONFUSION_KEY}/json/"
                f"subwConfusion/{start}/{end}/"
            )
            data = self.fetch_json(url)
            body = data.get("subwConfusion", {})
            page_rows = body.get("row", []) or []
            if total is None:
                total = int(body.get("list_total_count") or len(page_rows))
            if not page_rows:
                break
            rows.extend(page_rows)
            if end >= total:
                break
            start = end + 1

        SUBWAY_RIDER_CACHE[cache_key] = rows
        return rows

    def current_subway_confusion_day_type(self):
        weekday = datetime.now().weekday()
        if weekday <= 4:
            return "평일"
        if weekday == 5:
            return "토요일"
        return "일요일"

    def current_subway_confusion_field(self):
        now = datetime.now()
        hour = now.hour
        minute = 30 if now.minute >= 30 else 0
        if hour < 5 or (hour == 5 and minute < 30):
            return "TIME0530", "05:30"
        if hour > 23 or (hour == 23 and minute > 30):
            return "TIME0030", "00:30"
        if hour == 0:
            return ("TIME0030", "00:30") if minute >= 30 else ("TIME0000", "00:00")
        return f"TIME{hour:02d}{minute:02d}", f"{hour:02d}:{minute:02d}"

    def infer_subway_direction_label(self, line_name, from_id, to_id, from_name, to_name, expected_count):
        normalized_line = self.normalize_line_name(line_name)
        if not normalized_line:
            return ""

        try:
            stations = self.fetch_subway_line_stations(line_name)
        except Exception:
            stations = []

        from_index = self.find_station_index(stations, self.short_station_code(from_id), from_name) if stations else None
        to_index = self.find_station_index(stations, self.short_station_code(to_id), to_name) if stations else None

        if normalized_line == "2호선" and from_index is not None and to_index is not None:
            forward = self.circular_slice(stations, from_index, to_index)
            backward = self.circular_slice(stations, to_index, from_index)
            use_forward = True
            if expected_count > 0:
                use_forward = abs((len(forward) - 1) - expected_count) <= abs((len(backward) - 1) - expected_count)
            else:
                use_forward = len(forward) <= len(backward)
            return "내선" if use_forward else "외선"

        if from_index is not None and to_index is not None:
            return "상선" if to_index >= from_index else "하선"

        from_code = self.to_int(self.short_station_code(from_id))
        to_code = self.to_int(self.short_station_code(to_id))
        if from_code and to_code:
            if normalized_line == "2호선":
                return "내선" if to_code >= from_code else "외선"
            return "상선" if to_code >= from_code else "하선"

        return ""

    def calculate_subway_confusion_congestion(self, station_name, line_name, direction_label=""):
        rows = self.fetch_subway_confusion_rows()
        day_type = self.current_subway_confusion_day_type()
        time_field, time_label = self.current_subway_confusion_field()
        normalized_station = self.normalize_station_name(station_name)
        normalized_line = self.normalize_line_name(line_name)

        matched_rows = []
        for row in rows:
            row_station = self.normalize_station_name(row.get("DPTRE_STTN"))
            row_line = self.normalize_line_name(row.get("LINE"))
            row_day = str(row.get("DOW_SE") or "").strip()
            if row_station != normalized_station:
                continue
            if normalized_line and row_line != normalized_line:
                continue
            if row_day != day_type:
                continue
            row_direction = str(row.get("UP_DOWN_SE") or "").strip()
            if direction_label and row_direction != direction_label:
                continue
            matched_rows.append(row)

        if not matched_rows:
            return {
                "source": "seoulSubwayConfusion",
                "status": "NO_DATA",
                "station": station_name,
                "lineName": line_name,
                "message": "공식 지하철 혼잡도 API에서 현재 역/호선 데이터를 찾지 못했습니다.",
            }

        scores = []
        directions = []
        for row in matched_rows:
            try:
                value = float(row.get(time_field) or 0)
            except (TypeError, ValueError):
                value = 0
            scores.append(value)
            direction = str(row.get("UP_DOWN_SE") or "").strip()
            if direction:
                directions.append(direction)

        score = round(sum(scores) / max(len(scores), 1), 1)
        label, color = self.congestion_label(score)
        matched_directions = sorted(set(directions))

        return {
            "source": "seoulSubwayConfusion",
            "status": "OK",
            "station": station_name,
            "lineName": line_name or self.row_text(matched_rows[0], ["LINE"]),
            "dayType": day_type,
            "timeField": time_field,
            "timeSlot": time_label,
            "matchedDirection": direction_label or (matched_directions[0] if len(matched_directions) == 1 else ""),
            "matchedDirections": matched_directions,
            "matchCount": len(matched_rows),
            "score": score,
            "label": label,
            "color": color,
            "reason": f"서울교통공사 공식 혼잡도 API의 {day_type} {time_label} 구간 {direction_label or '방향'} 값입니다.",
        }

    def calculate_subway_congestion(self, daily_payload, time_payload, station_name, line_name):
        daily_rows = daily_payload["rows"]
        time_rows = time_payload["rows"]
        daily_row = self.find_subway_rider_row(daily_rows, station_name, line_name)
        time_row = self.find_subway_rider_row(time_rows, station_name, line_name)

        if not daily_row:
            return {
                "source": "seoulSubwayCard",
                "status": "NO_DATA",
                "station": station_name,
                "lineName": line_name,
                "message": "해당 역/호선의 승하차 인원 데이터를 찾지 못했습니다.",
            }

        daily_on = self.row_number(daily_row, ["GTON_TNOPE", "RIDE_PASGR_NUM"])
        daily_off = self.row_number(daily_row, ["GTOFF_TNOPE", "ALIGHT_PASGR_NUM"])
        daily_total = daily_on + daily_off
        hourly_on = 0
        hourly_off = 0
        hourly_estimated_total = 0

        if time_row:
            hour = datetime.now().hour
            monthly_total = self.sum_hourly_row(time_row)
            hourly_on = self.row_number(time_row, [f"HR_{hour}_GET_ON_NOPE", self.legacy_hour_field(hour, "RIDE")])
            hourly_off = self.row_number(time_row, [f"HR_{hour}_GET_OFF_NOPE", self.legacy_hour_field(hour, "ALIGHT")])
            hourly_share = (hourly_on + hourly_off) / monthly_total if monthly_total else 0
            hourly_estimated_total = round(daily_total * hourly_share)

        vehicle_count = self.estimate_subway_vehicle_count(line_name)
        vehicle_estimated_passengers = round(hourly_estimated_total / max(vehicle_count, 1))
        max_capacity = self.estimate_subway_vehicle_capacity(line_name)
        score = self.capacity_utilization_percent(vehicle_estimated_passengers, max_capacity)
        label, color = self.congestion_label(score)

        return {
            "source": "seoulSubwayCard",
            "status": "OK",
            "station": station_name,
            "lineName": self.row_text(daily_row, ["SBWY_ROUT_LN_NM", "LINE_NUM"]) or line_name,
            "dailyDate": daily_payload["date"],
            "timeMonth": time_payload["month"],
            "dailyOn": daily_on,
            "dailyOff": daily_off,
            "dailyTotal": daily_total,
            "hourlyOn": hourly_on,
            "hourlyOff": hourly_off,
            "hourlyEstimatedTotal": hourly_estimated_total,
            "estimatedVehiclesPerHour": vehicle_count,
            "vehicleEstimatedPassengers": vehicle_estimated_passengers,
            "maximumCapacity": max_capacity,
            "currentPassengers": vehicle_estimated_passengers,
            "score": score,
            "label": label,
            "color": color,
            "reason": "현재 시간대 추정 승객 수를 열차 1편성 최대 수용 인원으로 나눈 혼잡도 비율입니다.",
        }

    def find_subway_rider_row(self, rows, station_name, line_name):
        normalized_station = self.normalize_station_name(station_name)
        normalized_line = self.normalize_line_name(line_name)

        for row in rows:
            row_station = self.normalize_station_name(self.row_text(row, ["SBWY_STNS_NM", "SUB_STA_NM", "STTN"]))
            row_line = self.normalize_line_name(self.row_text(row, ["SBWY_ROUT_LN_NM", "LINE_NUM"]))
            if row_station == normalized_station and (not normalized_line or row_line == normalized_line):
                return row

        for row in rows:
            row_station = self.normalize_station_name(self.row_text(row, ["SBWY_STNS_NM", "SUB_STA_NM", "STTN"]))
            if row_station == normalized_station:
                return row

        return None

    def normalize_station_name(self, value):
        normalized = re.sub(r"\(.+?\)", "", str(value or "")).strip()
        return re.sub(r"역$", "", normalized).strip()

    def normalize_line_name(self, value):
        normalized = str(value or "").replace(" ", "").strip()
        return re.sub(r"^0+(\d+호선)$", r"\1", normalized)

    def row_text(self, row, keys):
        for key in keys:
            value = row.get(key)
            if value not in (None, ""):
                return str(value)
        return ""

    def row_number(self, row, keys):
        for key in keys:
            try:
                return int(float(row.get(key) or 0))
            except (TypeError, ValueError):
                continue
        return 0

    def legacy_hour_field(self, hour, kind):
        names = {
            0: "MIDNIGHT",
            1: "ONE",
            2: "TWO",
            3: "THREE",
            4: "FOUR",
            5: "FIVE",
            6: "SIX",
            7: "SEVEN",
            8: "EIGHT",
            9: "NINE",
            10: "TEN",
            11: "ELEVEN",
            12: "TWELVE",
            13: "THIRTEEN",
            14: "FOURTEEN",
            15: "FIFTEEN",
            16: "SIXTEEN",
            17: "SEVENTEEN",
            18: "EIGHTEEN",
            19: "NINETEEN",
            20: "TWENTY",
            21: "TWENTY_ONE",
            22: "TWENTY_TWO",
            23: "TWENTY_THREE",
        }
        return f"{names.get(hour, 'MIDNIGHT')}_{kind}_NUM"

    def sum_hourly_row(self, row):
        total = 0
        for hour in range(24):
            total += self.row_number(row, [f"HR_{hour}_GET_ON_NOPE", self.legacy_hour_field(hour, "RIDE")])
            total += self.row_number(row, [f"HR_{hour}_GET_OFF_NOPE", self.legacy_hour_field(hour, "ALIGHT")])
        return total

    def estimate_subway_vehicle_count(self, line_name):
        hour = datetime.now().hour
        is_peak = 7 <= hour <= 9 or 17 <= hour <= 20
        base = {
            "1호선": 18,
            "2호선": 30,
            "3호선": 20,
            "4호선": 20,
            "5호선": 18,
            "6호선": 14,
            "7호선": 18,
            "8호선": 12,
            "9호선": 20,
            "경의중앙선": 8,
            "공항철도": 8,
            "경춘선": 6,
            "수인분당선": 10,
            "신분당선": 16,
        }.get(self.normalize_line_name(line_name), 14)
        return round(base * (1.15 if is_peak else 0.78))

    def estimate_subway_vehicle_capacity(self, line_name):
        normalized_line = self.normalize_line_name(line_name)
        return {
            "1호선": 1280,
            "2호선": 1600,
            "3호선": 1280,
            "4호선": 1280,
            "5호선": 1280,
            "6호선": 1280,
            "7호선": 1280,
            "8호선": 1280,
            "9호선": 960,
            "경의중앙선": 1280,
            "공항철도": 960,
            "경춘선": 1280,
            "수인분당선": 1280,
            "신분당선": 900,
        }.get(normalized_line, 1280)

    def capacity_utilization_percent(self, current_passengers, maximum_capacity):
        if maximum_capacity <= 0:
            return 0
        return max(0, min(100, round((current_passengers / maximum_capacity) * 100)))

    def congestion_label(self, score):
        if score <= 25:
            return "원활", "#2563eb"
        if score <= 50:
            return "보통", "#16a34a"
        if score <= 75:
            return "약간 혼잡", "#f97316"
        if score <= 100:
            return "혼잡", "#dc2626"
        return "매우 혼잡", "#991b1b"

    def handle_bus_realtime(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        stop_id = (params.get("stopId", [""])[0] or "").strip()
        route_id = (params.get("routeId", [""])[0] or "").strip()
        route_name = (params.get("routeName", [""])[0] or "").strip()

        if not stop_id:
            return self.end_json(400, {"error": "Missing stopId parameter"})

        try:
            body = self.fetch_bus_arrival_xml(stop_id, route_id, route_name)
            return self.end_json(200, self.parse_bus_arrival_xml(body, stop_id, route_id, route_name))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return self.end_json(
                exc.code,
                {"error": "BUS_REALTIME_HTTP_ERROR", "status": exc.code, "body": body},
            )
        except Exception as exc:
            return self.end_json(502, {"error": "BUS_REALTIME_ERROR", "message": str(exc)})

    def handle_bus_congestion(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        stop_id = (params.get("stopId", [""])[0] or "").strip()
        route_id = (params.get("routeId", [""])[0] or "").strip()
        route_name = (params.get("routeName", [""])[0] or "").strip()

        if not stop_id:
            return self.end_json(400, {"error": "Missing stopId parameter"})

        try:
            official_result = self.fetch_bus_realtime_congestion(stop_id, route_id, route_name)
            if official_result.get("status") == "OK":
                return self.end_json(200, official_result)

            daily_payload = self.fetch_latest_bus_daily_match(stop_id, route_id, route_name)
            time_payload = self.fetch_bus_time_match(self.latest_subway_time_month(), stop_id, route_id, route_name)
            result = self.calculate_bus_congestion(daily_payload, time_payload, stop_id, route_id, route_name)
            return self.end_json(200, result)
        except Exception as exc:
            return self.end_json(502, {"error": "BUS_CONGESTION_ERROR", "message": str(exc)})

    def handle_bus_segment_shape(self, parsed):
        params = urllib.parse.parse_qs(parsed.query)
        route_id = (params.get("routeId", [""])[0] or "").strip()
        from_id = (params.get("fromId", [""])[0] or "").strip()
        to_id = (params.get("toId", [""])[0] or "").strip()

        if not route_id or not from_id or not to_id:
            return self.end_json(400, {"error": "Missing bus shape parameters"})

        try:
            stations = self.fetch_bus_route_stations(route_id)
            station_points = self.slice_bus_segment(stations, from_id, to_id)
            route_points = self.fetch_bus_route_path(route_id)
            points = self.slice_route_path_by_stations(route_points, station_points) or station_points
            return self.end_json(
                200,
                {
                    "status": "OK",
                    "routeId": route_id,
                    "points": points,
                    "source": "busRouteInfo/getRoutePath",
                },
            )
        except Exception as exc:
            return self.end_json(502, {"error": "BUS_SEGMENT_SHAPE_ERROR", "message": str(exc)})

    def fetch_bus_arrival_xml(self, stop_id, route_id="", route_name=""):
        if stop_id and route_id:
            route_order = self.find_bus_station_order(route_id, stop_id)
            if route_order:
                query = urllib.parse.urlencode(
                    {
                        "serviceKey": SEOUL_BUS_REALTIME_KEY,
                        "stId": stop_id,
                        "busRouteId": route_id,
                        "ord": route_order,
                    }
                )
                url = f"http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute?{query}"
                body = self.fetch_xml_text(url)
                parsed = self.parse_bus_arrival_xml(body, stop_id, route_id, route_name)
                if parsed.get("headerCode") == "0" and parsed.get("arrivals"):
                    return body

        query = urllib.parse.urlencode({"ServiceKey": SEOUL_BUS_REALTIME_KEY, "stId": stop_id})
        url = f"http://ws.bus.go.kr/api/rest/arrive/getLowArrInfoByStId?{query}"
        return self.fetch_xml_text(url)

    def fetch_xml_text(self, url):
        request = urllib.request.Request(url, headers={"Accept": "application/xml"}, method="GET")
        with urllib.request.urlopen(request, timeout=10) as response:
            return response.read().decode("utf-8", errors="replace")

    def find_bus_station_order(self, route_id, stop_id):
        if not route_id or not stop_id:
            return 0
        stations = self.fetch_bus_route_stations(route_id)
        match = next((station for station in stations if station.get("id") == stop_id), None)
        return self.to_int(match.get("seq")) if match else 0

    def fetch_bus_route_type(self, route_id):
        if not route_id:
            return ""
        cache_key = f"bus-route-type:{route_id}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        stations = self.fetch_bus_route_stations(route_id)
        route_type = str(stations[0].get("routeType") or "") if stations else ""
        SUBWAY_RIDER_CACHE[cache_key] = route_type
        return route_type

    def fetch_bus_route_stations(self, route_id):
        cache_key = f"bus-route-stations:{route_id}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        query = urllib.parse.urlencode({"serviceKey": SEOUL_TRANSIT_ROUTE_KEY, "busRouteId": route_id})
        url = f"http://ws.bus.go.kr/api/rest/busRouteInfo/getStaionByRoute?{query}"
        request = urllib.request.Request(url, headers={"Accept": "application/xml"}, method="GET")
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace")

        root = ET.fromstring(body)
        stations = []
        for item in root.findall("./msgBody/itemList"):
            lat = self.to_float(self.node_text(item, "gpsY"))
            lng = self.to_float(self.node_text(item, "gpsX"))
            if lat and lng:
                stations.append(
                    {
                        "id": self.node_text(item, "station"),
                        "name": self.node_text(item, "stationNm"),
                        "seq": self.to_int(self.node_text(item, "seq")),
                        "routeType": self.node_text(item, "routeType"),
                        "lat": lat,
                        "lng": lng,
                    }
                )

        stations.sort(key=lambda item: item["seq"])
        SUBWAY_RIDER_CACHE[cache_key] = stations
        return stations

    def fetch_bus_route_path(self, route_id):
        cache_key = f"bus-route-path:{route_id}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        query = urllib.parse.urlencode({"ServiceKey": SEOUL_TRANSIT_ROUTE_KEY, "busRouteId": route_id})
        url = f"http://ws.bus.go.kr/api/rest/busRouteInfo/getRoutePath?{query}"
        request = urllib.request.Request(url, headers={"Accept": "application/xml"}, method="GET")
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace")

        root = ET.fromstring(body)
        points = []
        for item in root.findall("./msgBody/itemList"):
            lat = self.to_float(self.node_text(item, "gpsY"))
            lng = self.to_float(self.node_text(item, "gpsX"))
            if lat and lng:
                points.append(
                    {
                        "lat": lat,
                        "lng": lng,
                        "seq": self.to_int(self.node_text(item, "no")),
                    }
                )

        points.sort(key=lambda item: item["seq"])
        SUBWAY_RIDER_CACHE[cache_key] = points
        return points

    def slice_route_path_by_stations(self, route_points, station_points):
        if len(route_points) < 2 or len(station_points) < 2:
            return []

        start_index = self.nearest_point_index(route_points, station_points[0])
        end_index = self.nearest_point_index(route_points, station_points[-1])
        if start_index is None or end_index is None:
            return []

        if start_index <= end_index:
            return route_points[start_index : end_index + 1]
        return route_points[start_index:] + route_points[: end_index + 1]

    def nearest_point_index(self, points, target):
        best_index = None
        best_distance = float("inf")
        for index, point in enumerate(points):
            distance = (point["lat"] - target["lat"]) ** 2 + (point["lng"] - target["lng"]) ** 2
            if distance < best_distance:
                best_distance = distance
                best_index = index
        return best_index

    def slice_bus_segment(self, stations, from_id, to_id):
        from_index = next((index for index, station in enumerate(stations) if station["id"] == from_id), None)
        to_index = next((index for index, station in enumerate(stations) if station["id"] == to_id), None)

        if from_index is None or to_index is None:
            return []

        if from_index <= to_index:
            return stations[from_index : to_index + 1]
        return stations[from_index:] + stations[: to_index + 1]

    def fetch_latest_bus_daily_match(self, stop_id, route_id, route_name):
        cache_key = f"bus-daily:{stop_id}:{route_id}:{route_name}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        start_date = date.today() - timedelta(days=3)
        for offset in range(0, 30):
            target_date = (start_date - timedelta(days=offset)).strftime("%Y%m%d")
            match = self.fetch_bus_daily_match(target_date, stop_id, route_id, route_name)
            if match:
                payload = {"date": target_date, "row": match}
                SUBWAY_RIDER_CACHE[cache_key] = payload
                return payload

        return {"date": "", "row": None}

    def fetch_bus_daily_match(self, target_date, stop_id, route_id, route_name):
        return self.fetch_paged_match(
            SEOUL_BUS_DAILY_RIDERS_KEY,
            "CardBusStatisticsServiceNew",
            target_date,
            lambda row: self.is_bus_rider_match(row, stop_id, route_id, route_name),
        )

    def fetch_bus_time_match(self, month, stop_id, route_id, route_name):
        cache_key = f"bus-time:{month}:{stop_id}:{route_id}:{route_name}"
        if cache_key in SUBWAY_RIDER_CACHE:
            return SUBWAY_RIDER_CACHE[cache_key]

        match = self.fetch_paged_match(
            SEOUL_BUS_TIME_RIDERS_KEY,
            "CardBusTimeNew",
            month,
            lambda row: self.is_bus_rider_match(row, stop_id, route_id, route_name),
        )
        payload = {"month": month, "row": match}
        SUBWAY_RIDER_CACHE[cache_key] = payload
        return payload

    def fetch_paged_match(self, key, service, period, matcher):
        start = 1
        while start <= 50000:
            end = start + 999
            url = f"{SEOUL_OPENAPI_BASE}/{key}/json/{service}/{start}/{end}/{period}"
            data = self.fetch_json(url)
            body = data.get(service, {})
            rows = body.get("row", []) or []
            for row in rows:
                if matcher(row):
                    return row

            total = int(body.get("list_total_count") or 0)
            if not rows or end >= total:
                break
            start = end + 1

        return None

    def is_bus_rider_match(self, row, stop_id, route_id, route_name):
        row_stop_id = str(row.get("STOPS_ID") or "").strip()
        row_route_id = str(row.get("RTE_ID") or "").strip()
        row_route_no = str(row.get("RTE_NO") or "").strip()
        normalized_route = self.normalize_route_name(route_name)

        if stop_id and row_stop_id != stop_id:
            return False
        if route_id and row_route_id and row_route_id == route_id:
            return True
        if normalized_route and row_route_no == normalized_route:
            return True
        return not route_id and not normalized_route

    def normalize_route_name(self, value):
        return re.sub(r"[^0-9A-Za-z가-힣-]", "", str(value or "").replace("버스", "").replace("번", ""))

    def calculate_bus_congestion(self, daily_payload, time_payload, stop_id, route_id, route_name):
        daily_row = daily_payload.get("row")
        time_row = time_payload.get("row")

        if not daily_row:
            return {
                "source": "seoulBusCard",
                "status": "NO_DATA",
                "stopId": stop_id,
                "routeId": route_id,
                "routeName": route_name,
                "message": "해당 정류장/노선의 승하차 인원 데이터를 찾지 못했습니다.",
            }

        daily_on = self.row_number(daily_row, ["GTON_TNOPE", "RIDE_PASGR_NUM"])
        daily_off = self.row_number(daily_row, ["GTOFF_TNOPE", "ALIGHT_PASGR_NUM"])
        daily_total = daily_on + daily_off
        hourly_on = 0
        hourly_off = 0
        hourly_estimated_total = 0

        if time_row:
            hour = datetime.now().hour
            monthly_total = self.sum_bus_hourly_row(time_row)
            hourly_on = self.row_number(time_row, [f"HR_{hour}_GET_ON_TNOPE", f"HR_{hour}_GET_ON_NOPE"])
            hourly_off = self.row_number(time_row, [f"HR_{hour}_GET_OFF_TNOPE", f"HR_{hour}_GET_OFF_NOPE"])
            hourly_share = (hourly_on + hourly_off) / monthly_total if monthly_total else 0
            hourly_estimated_total = round(daily_total * hourly_share)

        vehicle_count = self.estimate_bus_vehicle_count(time_row)
        vehicle_estimated_passengers = round(hourly_estimated_total / max(vehicle_count, 1))
        max_capacity = self.estimate_bus_vehicle_capacity(time_row)
        score = self.capacity_utilization_percent(vehicle_estimated_passengers, max_capacity)
        label, color = self.congestion_label(score)

        return {
            "source": "seoulBusCard",
            "status": "OK",
            "stopId": stop_id,
            "routeId": route_id or self.row_text(daily_row, ["RTE_ID"]),
            "routeName": self.row_text(daily_row, ["RTE_NO", "RTE_NM"]) or route_name,
            "stopName": self.row_text(daily_row, ["SBWY_STNS_NM"]),
            "dailyDate": daily_payload["date"],
            "timeMonth": time_payload.get("month"),
            "dailyOn": daily_on,
            "dailyOff": daily_off,
            "dailyTotal": daily_total,
            "hourlyOn": hourly_on,
            "hourlyOff": hourly_off,
            "hourlyEstimatedTotal": hourly_estimated_total,
            "estimatedVehiclesPerHour": vehicle_count,
            "vehicleEstimatedPassengers": vehicle_estimated_passengers,
            "maximumCapacity": max_capacity,
            "currentPassengers": vehicle_estimated_passengers,
            "score": score,
            "label": label,
            "color": color,
            "reason": "현재 시간대 추정 승객 수를 버스 1대 최대 수용 인원으로 나눈 혼잡도 비율입니다.",
        }

    def fetch_bus_realtime_congestion(self, stop_id, route_id, route_name):
        body = self.fetch_bus_arrival_xml(stop_id, route_id, route_name)
        arrival_payload = self.parse_bus_arrival_xml(body, stop_id, route_id, route_name)
        first_arrival = next(
            (
                item for item in arrival_payload.get("arrivals", [])
                if item.get("congestionCode1") or item.get("rerideCount1") or item.get("fullFlag1")
            ),
            arrival_payload.get("arrivals", [{}])[0] if arrival_payload.get("arrivals") else {},
        )
        return self.calculate_bus_realtime_congestion(arrival_payload, first_arrival, stop_id, route_id, route_name)

    def calculate_bus_realtime_congestion(self, arrival_payload, arrival, stop_id, route_id, route_name):
        congestion_code = self.to_int(arrival.get("congestionCode1"))
        full_flag = str(arrival.get("fullFlag1") or "").strip()
        reride_count = self.to_int(arrival.get("rerideCount1"))
        if full_flag == "1":
            congestion_code = 7

        mapping = {
            3: (22, "여유"),
            4: (45, "보통"),
            5: (75, "혼잡"),
            6: (92, "매우 혼잡"),
            7: (100, "만차"),
        }

        if congestion_code not in mapping and reride_count <= 0:
            return {
                "source": "seoulBusRealtime",
                "status": "NO_DATA",
                "stopId": stop_id,
                "routeId": route_id,
                "routeName": route_name,
                "headerCode": arrival_payload.get("headerCode"),
                "headerMessage": arrival_payload.get("headerMessage"),
                "message": "서울 버스 도착정보 API에서 혼잡도 값을 찾지 못했습니다.",
            }

        if congestion_code in mapping:
            score, label = mapping[congestion_code]
            _, color = self.congestion_label(score)
        else:
            score = self.capacity_utilization_percent(reride_count, 55)
            label, color = self.congestion_label(score)

        return {
            "source": "seoulBusRealtime",
            "status": "OK",
            "stopId": stop_id,
            "routeId": arrival.get("routeId") or route_id,
            "routeName": arrival.get("routeName") or route_name,
            "stopName": arrival.get("stationName"),
            "arrivalMessage": arrival.get("arrmsg1"),
            "arrivalSeconds": arrival.get("arrivalSeconds1"),
            "stationCount": arrival.get("stationCount1"),
            "vehicleId": arrival.get("vehicleId1"),
            "vehicleNumber": arrival.get("plainNo1"),
            "busType": arrival.get("busType1"),
            "congestionCode": congestion_code,
            "fullFlag": full_flag,
            "rerideCount": reride_count,
            "lastUpdated": arrival.get("lastUpdated"),
            "score": score,
            "label": label,
            "color": color,
            "reason": "서울 버스 도착정보 API의 차량별 실시간 혼잡도 값을 우선 반영했습니다.",
        }

    def sum_bus_hourly_row(self, row):
        total = 0
        for hour in range(24):
            total += self.row_number(row, [f"HR_{hour}_GET_ON_TNOPE", f"HR_{hour}_GET_ON_NOPE"])
            total += self.row_number(row, [f"HR_{hour}_GET_OFF_TNOPE", f"HR_{hour}_GET_OFF_NOPE"])
        return total

    def estimate_bus_vehicle_count(self, time_row):
        bus_type = self.row_text(time_row or {}, ["TRFC_MNS_TYPE_NM"])
        hour = datetime.now().hour
        is_peak = 7 <= hour <= 9 or 17 <= hour <= 20
        base = 8
        if "마을" in bus_type:
            base = 10
        elif "간선" in bus_type:
            base = 9
        elif "지선" in bus_type:
            base = 8
        elif "광역" in bus_type or "순환" in bus_type:
            base = 6
        return round(base * (1.2 if is_peak else 0.75))

    def estimate_bus_vehicle_capacity(self, time_row):
        bus_type = self.row_text(time_row or {}, ["TRFC_MNS_TYPE_NM"])
        if "마을" in bus_type:
            return 32
        if "간선" in bus_type:
            return 72
        if "지선" in bus_type:
            return 55
        if "광역" in bus_type:
            return 44
        if "순환" in bus_type:
            return 50
        return 55

    def parse_bus_arrival_xml(self, body, stop_id, route_id, route_name):
        root = ET.fromstring(body)
        header = root.find("msgHeader")
        header_code = self.node_text(header, "headerCd")
        header_message = self.node_text(header, "headerMsg")

        arrivals = []
        for item in root.findall("./msgBody/itemList"):
            item_route_id = self.node_text(item, "busRouteId")
            item_route_name = self.node_text(item, "rtNm")
            if route_id and item_route_id and item_route_id != route_id:
                continue
            if route_name and item_route_name and route_name not in item_route_name:
                continue

            arrmsg1 = self.node_text(item, "arrmsg1")
            arrmsg2 = self.node_text(item, "arrmsg2")
            arrivals.append(
                {
                    "routeId": item_route_id,
                    "routeName": item_route_name or route_name,
                    "arrmsg1": arrmsg1,
                    "arrmsg2": arrmsg2,
                    "arrivalSeconds1": self.bus_arrival_seconds(item, arrmsg1, 1),
                    "arrivalSeconds2": self.bus_arrival_seconds(item, arrmsg2, 2),
                    "stationCount1": self.bus_arrival_station_count(item, arrmsg1, 1),
                    "stationCount2": self.bus_arrival_station_count(item, arrmsg2, 2),
                    "congestionCode1": self.to_int(self.first_node_text(item, ["congetion1", "congestion1"])),
                    "congestionCode2": self.to_int(self.first_node_text(item, ["congetion2", "congestion2"])),
                    "rerideCount1": self.to_int(self.first_node_text(item, ["rerideNum1", "reride_Num1", "brdrde_Num1"])),
                    "rerideCount2": self.to_int(self.first_node_text(item, ["rerideNum2", "reride_Num2", "brdrde_Num2"])),
                    "fullFlag1": self.first_node_text(item, ["isFullFlag1", "full1"]),
                    "fullFlag2": self.first_node_text(item, ["isFullFlag2", "full2"]),
                    "plainNo1": self.node_text(item, "plainNo1"),
                    "plainNo2": self.node_text(item, "plainNo2"),
                    "busType1": self.node_text(item, "busType1"),
                    "busType2": self.node_text(item, "busType2"),
                    "stationName": self.node_text(item, "stNm"),
                    "nextStation": self.node_text(item, "nxtStn"),
                    "direction": self.node_text(item, "adirection") or self.node_text(item, "dir"),
                    "vehicleId1": self.node_text(item, "vehId1"),
                    "vehicleId2": self.node_text(item, "vehId2"),
                    "lastUpdated": self.node_text(item, "mkTm"),
                    "firstBus": self.node_text(item, "isFirst1"),
                    "lastBus": self.node_text(item, "isLast1"),
                }
            )

        return {
            "stopId": stop_id,
            "routeId": route_id,
            "routeName": route_name,
            "headerCode": header_code,
            "headerMessage": header_message,
            "arrivals": arrivals[:3],
        }

    def bus_arrival_seconds(self, item, message, order):
        if re.search(r"곧|도착|진입", str(message or "")):
            return self.parse_arrival_seconds(message)

        field_candidates = [
            f"arrmsgSec{order}",
            f"traTime{order}",
            f"exps{order}",
            f"arriveTime{order}",
        ]
        for field in field_candidates:
            value = self.to_int(self.node_text(item, field))
            if 0 < value <= 86400:
                return value

        return self.parse_arrival_seconds(message)

    def bus_arrival_station_count(self, item, message, order):
        match = re.search(r"\[(\d+)\s*번째\s*전\]", message or "")
        if match:
            return self.to_int(match.group(1))

        field_candidates = [f"stationCount{order}"]
        for field in field_candidates:
            value = self.to_int(self.node_text(item, field))
            if value > 0:
                return value
        return 0

    def parse_arrival_seconds(self, message):
        value = str(message or "")
        if not value:
            return 0
        if re.search(r"곧|도착|진입", value):
            return 0

        minute_match = re.search(r"(\d+)\s*분(?:\s*(\d+)\s*초)?", value)
        if minute_match:
            minutes = self.to_int(minute_match.group(1))
            seconds = self.to_int(minute_match.group(2))
            return minutes * 60 + seconds

        second_match = re.search(r"(\d+)\s*초", value)
        return self.to_int(second_match.group(1)) if second_match else 0

    def fetch_json(self, url):
        request = urllib.request.Request(url, headers={"Accept": "application/json"}, method="GET")
        with urllib.request.urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8", errors="replace").strip()
            if not body:
                return {}
            return json.loads(body)

    def normalize_line_num(self, value):
        return str(value or "").replace("0", "").replace("호선", "호선")

    def handle_transit_route(self, parsed, endpoint):
        params = urllib.parse.parse_qs(parsed.query)
        try:
            start_x = self.required_param(params, "startX")
            start_y = self.required_param(params, "startY")
            end_x = self.required_param(params, "endX")
            end_y = self.required_param(params, "endY")
        except ValueError as exc:
            return self.end_json(400, {"error": str(exc)})

        query = urllib.parse.urlencode(
            {
                "ServiceKey": SEOUL_TRANSIT_ROUTE_KEY,
                "startX": start_x,
                "startY": start_y,
                "endX": end_x,
                "endY": end_y,
            }
        )
        url = f"{SEOUL_TRANSIT_ROUTE_BASE}/{endpoint}?{query}"

        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                body = response.read().decode("utf-8", errors="replace")
            return self.end_json(200, self.parse_transit_route_xml(body, endpoint))
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            return self.end_json(
                exc.code,
                {"error": "TRANSIT_ROUTE_HTTP_ERROR", "status": exc.code, "body": body},
            )
        except Exception as exc:
            return self.end_json(502, {"error": "TRANSIT_ROUTE_ERROR", "message": str(exc)})

    def required_param(self, params, name):
        value = (params.get(name, [""])[0] or "").strip()
        if not value:
            raise ValueError(f"Missing {name} parameter")
        return value

    def parse_transit_route_xml(self, body, endpoint):
        root = ET.fromstring(body)
        header = root.find("msgHeader")
        header_code = self.node_text(header, "headerCd")
        header_message = self.node_text(header, "headerMsg")

        routes = []
        for item in root.findall("./msgBody/itemList"):
            paths = []
            for path_node in item.findall("pathList"):
                rail_link_count = len(path_node.findall("railLinkList"))
                line_name = self.node_text(path_node, "routeNm")
                is_subway = bool(path_node.findall("railLinkList")) or line_name.endswith("호선")
                paths.append(
                    {
                        "mode": "subway" if is_subway else "bus",
                        "fromId": self.node_text(path_node, "fid"),
                        "fromName": self.node_text(path_node, "fname"),
                        "fromLng": self.to_float(self.node_text(path_node, "fx")),
                        "fromLat": self.to_float(self.node_text(path_node, "fy")),
                        "lineName": line_name,
                        "routeId": self.node_text(path_node, "routeId"),
                        "busRouteType": "" if is_subway else self.fetch_bus_route_type(self.node_text(path_node, "routeId")),
                        "toId": self.node_text(path_node, "tid"),
                        "toName": self.node_text(path_node, "tname"),
                        "toLng": self.to_float(self.node_text(path_node, "tx")),
                        "toLat": self.to_float(self.node_text(path_node, "ty")),
                        "railLinkCount": rail_link_count,
                    }
                )

            routes.append(
                {
                    "distance": self.to_int(self.node_text(item, "distance")),
                    "time": self.to_int(self.node_text(item, "time")),
                    "paths": paths,
                }
            )

        return {
            "headerCode": header_code,
            "headerMessage": header_message,
            "endpoint": endpoint,
            "routes": routes,
        }

    def node_text(self, node, name):
        if node is None:
            return ""
        child = node.find(name)
        if child is None or child.text is None:
            return ""
        return child.text.strip()

    def first_node_text(self, node, names):
        for name in names:
            value = self.node_text(node, name)
            if value:
                return value
        return ""

    def to_float(self, value):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def to_int(self, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return 0


if __name__ == "__main__":
    os.chdir(ROOT)
    server = ThreadingHTTPServer((HOST, PORT), StrangeMapHandler)
    print(f"Serving StrangeMap demo on http://localhost:{PORT}")
    server.serve_forever()
