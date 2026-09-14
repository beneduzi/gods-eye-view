# APRS-IS live vessels

The optional APRS-IS provider is a server-side, receive-only TCP client. It
uses the existing vessel source contract and renderer; it does not create a
second visual layer. Enable it with `APRS_IS_ENABLED=1` (or `APRS_IS_HOST`) and
configure `APRS_IS_HOST`, `APRS_IS_PORT`, `APRS_IS_CALLSIGN`, and
`APRS_IS_PASSCODE`. Passcode `-1` is receive-only; `N0CALL` is used when no
callsign is supplied. Credentials remain on the server.

`APRS_IS_FILTER` defaults to `r/0/0/180` because the current vessel endpoint
does not pass viewport bounds to this provider. Set a narrower APRS-IS filter
explicitly for production. The endpoint is `/api/aprs-live`; no APRS.fi API or
scraping is involved. Records are bounded to 2,000 recent vessels and stale
records expire after 30 minutes.

Attribution: data is received from APRS-IS and APRS amateur-radio networks.
