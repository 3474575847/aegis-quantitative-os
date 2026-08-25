import asyncio

import httpx


async def test_audit_objectives() -> None:
    print("==================================================")
    print("   AEGIS-ALPHA SYSTEM TELEMETRY AUDIT SUITE")
    print("==================================================")

    async with httpx.AsyncClient(base_url="http://localhost:8000") as client:
        # Test Objective 1: Real-Time Market Ticker & Fallback Metadata
        print("\n[1] Auditing Market Ticker API & Fallback Tracking...")
        resp = await client.get("/api/market/ticker/BTC")
        assert resp.status_code == 200, f"BTC ticker failed: {resp.status_code}"
        btc_quote = resp.json()
        print(f"    ✓ BTC Spot Quote: ${btc_quote['price']:,.2f} | Exchange: {btc_quote['exchange']} | Fallback: {btc_quote['is_fallback']}")
        assert isinstance(btc_quote["is_fallback"], bool), "is_fallback field missing"

        resp_nvda = await client.get("/api/market/ticker/NVDA")
        assert resp_nvda.status_code == 200, f"NVDA ticker failed: {resp_nvda.status_code}"
        nvda_quote = resp_nvda.json()
        print(f"    ✓ NVDA Quote: ${nvda_quote['price']:,.2f} | Exchange: {nvda_quote['exchange']} | Fallback: {nvda_quote['is_fallback']}")

        # Test Objective 3: Source Mapping & Event Logging Alignment
        print("\n[2] Auditing Source Mapping & Event Logging Alignment...")
        resp_events = await client.get("/api/events?limit=20")
        assert resp_events.status_code == 200, f"Events failed: {resp_events.status_code}"
        events = resp_events.json()
        sources = {e["source"] for e in events}
        print(f"    ✓ Distinct Event Log Sources: {sources}")
        
        # Verify no empty payload events pollute the ledger
        empty_completed_events = [
            e for e in events 
            if e["event_type"] == "SensorRunCompleted" and e.get("payload", {}).get("events_count") == 0
        ]
        print(f"    ✓ Empty SensorRunCompleted events in log: {len(empty_completed_events)} (Expected: 0)")
        assert len(empty_completed_events) == 0, "Found empty payload SensorRunCompleted events in log!"

        # Test Objective 4: Floating-Point Precision & Rounding Contract
        print("\n[3] Auditing Floating-Point Precision & Rounding Contract...")
        resp_signals = await client.get("/api/signals")
        assert resp_signals.status_code == 200, f"Signals list failed: {resp_signals.status_code}"
        signals = resp_signals.json()
        for sig in signals:
            val = sig.get("latest_value")
            if val is not None:
                str_val = str(val)
                decimals = len(str_val.split(".")[1]) if "." in str_val else 0
                print(f"    ✓ Factor '{sig['name']}': value={val} (decimals={decimals})")
                assert decimals <= 4, f"Precision violation in factor {sig['name']}: {val}"

    print("\n==================================================")
    print("   ALL AUDIT OBJECTIVES VERIFIED SUCCESSFULLY!   ")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(test_audit_objectives())
