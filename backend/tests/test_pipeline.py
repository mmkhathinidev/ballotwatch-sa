"""Unit tests for the normalisation and parsing pipeline.

Run with:  cd backend && python -m unittest discover -s tests -v
No third-party test runner required.
"""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from app import iec, prepoll, store

PARTIES = {
    0: {"id": 0, "name": "IND", "full_name": "INDEPENDENTS", "colour": "#9EBBD7"},
    7: {"id": 7, "name": "ANC", "full_name": "AFRICAN NATIONAL CONGRESS", "colour": "#06fb06"},
    52: {"id": 52, "name": "DA", "full_name": "DEMOCRATIC ALLIANCE", "colour": "#f4f400"},
}


def party(pid: int, votes: int, pct: float, ward: int, pr: int, councils: int) -> dict:
    return {
        "ID": pid,
        "TotalValidVotes": votes,
        "PercOfVotes": pct,
        "WardSeatsWon": ward,
        "PRSeatsWon": pr,
        "CouncilsWon": councils,
        "IsLeadingPartyVotes": False,
        "RegisteredVoters": 1_000_000,
        "TotalVotesCast": 800_000,
        "ValidVotesCast": 790_000,
        "SpoiltVotes": 10_000,
    }


def national_payload() -> dict:
    return {
        "ElectoralEventID": 1887,
        "ProvinceID": 0,
        "ReportDate": "2026-11-04T23:10:00+02:00",
        "PartyBallotResults": [
            party(52, 240_000, 30.38, 40, 40, 2),
            party(7, 500_000, 63.29, 120, 100, 8),
            party(0, 50_000, 6.33, 10, 0, 0),
        ],
        "ProvinceResults": [],
        "ProvinceExpected": 9,
        "MunicExpected": 213,
        "WardExpected": 4485,
        "VDExpected": 23696,
        "SeatsExpected": 8824,
        "ProvincesComplete": 0,
        "MuncipalitiesComplete": 0,
        "WardsComplete": 0,
        "VDsComplete": 0,
        "SeatsComplete": 0,
        "Perc_VDsComplete": 0,
        "Perc_WardsComplete": 0,
        "Perc_MunicipalityComplete": 0,
        "HungCouncils": 0,
        "MajorityCouncils": 0,
        "TotalDrawnCouncils": 0,
    }


class NationalViewTests(unittest.TestCase):
    def test_sorted_by_votes_and_named(self):
        view = iec.national_view(national_payload(), PARTIES)
        self.assertEqual([p["abbr"] for p in view["parties"]], ["ANC", "DA", "IND"])
        anc = view["parties"][0]
        self.assertEqual(anc["seats"], 220)
        self.assertEqual(anc["councils_won"], 8)

    def test_turnout_halves_ballots(self):
        view = iec.national_view(national_payload(), PARTIES)
        # 800 000 ballots / 2 ballots per voter / 1 000 000 registered
        self.assertAlmostEqual(view["turnout"], 40.0, places=2)

    def test_integrity_passes_on_exact_figures(self):
        view = iec.national_view(national_payload(), PARTIES)
        checks = {c["id"]: c["pass"] for c in view["integrity"]}
        self.assertTrue(checks["party-sum"])
        self.assertTrue(checks["cast-split"])

    def test_integrity_flags_broken_sums(self):
        payload = national_payload()
        payload["PartyBallotResults"][1]["TotalValidVotes"] = 390_000  # 10k vanishes
        view = iec.national_view(payload, PARTIES)
        checks = {c["id"]: c["pass"] for c in view["integrity"]}
        self.assertFalse(checks["party-sum"])

        payload = national_payload()
        payload["PartyBallotResults"][0]["SpoiltVotes"] = 10_000
        payload["PartyBallotResults"][0]["TotalVotesCast"] = 900_000
        view = iec.national_view(payload, PARTIES)
        checks = {c["id"]: c["pass"] for c in view["integrity"]}
        self.assertFalse(checks["cast-split"])

    def test_unknown_party_is_labelled_by_id(self):
        payload = national_payload()
        payload["PartyBallotResults"].append(party(1909, 1234, 0.16, 0, 0, 0))
        view = iec.national_view(payload, PARTIES)
        row = next(p for p in view["parties"] if p["id"] == 1909)
        self.assertEqual(row["abbr"], "Party 1909")
        self.assertFalse(row["known"])

    def test_no_counts_yet(self):
        payload = national_payload()
        for p in payload["PartyBallotResults"]:
            p.update(TotalValidVotes=0, PercOfVotes=0, TotalVotesCast=0,
                     ValidVotesCast=0, SpoiltVotes=0, WardSeatsWon=0,
                     PRSeatsWon=0, CouncilsWon=0)
        view = iec.national_view(payload, PARTIES)
        self.assertFalse(view["loaded"])
        self.assertEqual(view["seats_allocated"], 0)
        self.assertEqual(view["turnout"], 0)


class ProvinceViewTests(unittest.TestCase):
    def test_municipalities_are_ranked_by_roll(self):
        mun_a = {
            "MunicipalityID": 1001,
            "Municipality": "NMA - Nelson Mandela Bay",
            "RegPop": 500_000,
            "SeatsExpected": 120,
            "HungCouncils": 1,
            "Perc_WardsComplete": 100,
            "PartyBallotResults": [
                {"ID": 52, "TotalValidVotes": 210_000, "PercOfVotes": 39.9,
                 "WardSeatsWon": 23, "PRSeatsWon": 25},
            ],
        }
        mun_b = {**mun_a, "MunicipalityID": 1031, "Municipality": "EC442 - Umzimvubu",
                 "RegPop": 106_760, "PartyBallotResults": [
                     {"ID": 7, "TotalValidVotes": 75_521, "PercOfVotes": 76.8,
                      "WardSeatsWon": 28, "PRSeatsWon": 14}]}
        payload = {
            "ProvinceID": 1,
            "Province": "Eastern Cape",
            "ReportDate": "2021-11-02T10:00:00+02:00",
            "PartyBallotResults": [
                {"ID": 7, "TotalValidVotes": 900_000, "PercOfVotes": 63.0,
                 "WardSeatsWon": 200, "PRSeatsWon": 140, "RegisteredVoters": 3_000_000,
                 "TotalVotesCast": 2_400_000, "ValidVotesCast": 2_380_000},
            ],
            "MunicipalityResults": [mun_b, mun_a],
            "SeatsExpected": 600,
            "MunicExpected": 2,
            "MuncipalitiesComplete": 2,
            "HungCouncils": 1,
            "Perc_VDsComplete": 100,
            "Perc_WardsComplete": 100,
        }
        view = iec.province_view(payload, PARTIES)
        self.assertEqual(view["province"], "Eastern Cape")
        self.assertEqual([m["name"] for m in view["municipalities"]][0], "NMA - Nelson Mandela Bay")
        self.assertEqual(view["municipalities"][0]["parties"][0]["abbr"], "DA")
        self.assertAlmostEqual(view["turnout"], 40.0, places=2)


class RegistrationParserTests(unittest.TestCase):
    HTML = """
    <p>Registered voters as at <b>29 September 2026</b></p>
    <table>
      <tr><td>Eastern Cape</td><td>3,628,934</td><td>12.41%</td></tr>
      <tr><td>Free State</td><td>1,533,570</td><td>5.25%</td></tr>
      <tr><td>Gauteng</td><td>6,751,064</td><td>23.1%</td></tr>
      <tr><td>KwaZulu-Natal</td><td>6,030,969</td><td>20.63%</td></tr>
      <tr><td>Mpumalanga</td><td>2,170,139</td><td>7.42%</td></tr>
      <tr><td>Northern Cape</td><td>713,869</td><td>2.44%</td></tr>
      <tr><td>Limpopo</td><td>3,037,387</td><td>10.39%</td></tr>
      <tr><td>North West</td><td>1,907,623</td><td>6.53%</td></tr>
      <tr><td>Western Cape</td><td>3,457,253</td><td>11.83%</td></tr>
      <tr><td>Total</td><td>29,230,808</td></tr>
    </table>
    """

    def test_parses_and_reconciles(self):
        parsed = prepoll.parse_registration_html(self.HTML)
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed["as_at"], "2026-09-29")
        self.assertEqual(parsed["total"], 29_230_808)
        self.assertEqual(parsed["provinces"]["Gauteng"], 6_751_064)
        self.assertEqual(sum(parsed["provinces"].values()), parsed["total"])

    def test_rejects_inconsistent_page(self):
        broken = self.HTML.replace("29,230,808", "29,999,999")
        self.assertIsNone(prepoll.parse_registration_html(broken))

    def test_rejects_partial_page(self):
        broken = self.HTML.replace("Gauteng", "Nowhere")
        self.assertIsNone(prepoll.parse_registration_html(broken))


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self._orig = store.DB_PATH
        store._conn = None
        store.DB_PATH = Path(self.tmp.name) / "test.sqlite3"  # type: ignore[attr-defined]

    def tearDown(self):
        if store._conn is not None:
            store._conn.close()
        store._conn = None
        store.DB_PATH = self._orig  # type: ignore[attr-defined]
        self.tmp.cleanup()

    def test_dedupes_identical_payloads(self):
        payload = national_payload()
        self.assertTrue(store.save_snapshot(1887, "national", "0", "2026-11-04T23:10:00+02:00", "t1", payload))
        self.assertFalse(store.save_snapshot(1887, "national", "0", "2026-11-04T23:10:00+02:00", "t2", payload))
        payload["PartyBallotResults"][0]["TotalValidVotes"] += 1
        self.assertTrue(store.save_snapshot(1887, "national", "0", "2026-11-04T23:15:00+02:00", "t3", payload))

    def test_timeline_reports_progress(self):
        payload = national_payload()
        store.save_snapshot(1887, "national", "0", "2026-11-04T22:00:00+02:00", "t1", payload)
        payload = json.loads(json.dumps(payload))
        payload["VDsComplete"] = 500
        store.save_snapshot(1887, "national", "0", "2026-11-04T23:00:00+02:00", "t2", payload)
        points = store.timeline(1887)
        self.assertEqual(len(points), 2)
        self.assertEqual(points[-1]["vds"], 500)


if __name__ == "__main__":
    unittest.main()
