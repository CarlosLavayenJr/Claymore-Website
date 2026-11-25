# Claymores RFC on the App Store

Everything in the repo is ready (icon, version 1.0.0, iPhone only, encryption declared, Sign in with Apple entitlement). What's left needs your Apple account, so do it on your own Mac.

## No Mac? Build in the cloud (phone or iPad is enough)

`.github/workflows/ios-testflight.yml` builds, signs and uploads the app to TestFlight on GitHub's Macs. Do this once from your phone or iPad (Safari, "Request Desktop Website" helps):

1. **App Store Connect** → Apps → **+ New App** (fields in section 2 below).
2. **App Store Connect** → **Users and Access** → **Integrations** → **App Store Connect API** → **+** (Team Keys). Name it "GitHub", Access **Admin**, Generate. Note the **Key ID** and the **Issuer ID** (above the list), then **Download API Key**: a `.p8` file you can download only once. Open it in the Files app and copy all of its text.
3. **GitHub** → the repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**, three times:
   - `APP_STORE_CONNECT_KEY_ID`: the Key ID
   - `APP_STORE_CONNECT_ISSUER_ID`: the Issuer ID
   - `APP_STORE_CONNECT_KEY`: the full text of the `.p8`, including the BEGIN and END lines
4. **GitHub** → **Actions** → **iOS TestFlight** → **Run workflow** (main). About 15–20 minutes later the build is in TestFlight (section 4). Every run gets a new build number automatically.

Then skip to section 4.

## 1. One-time setup on your Mac

1. Install **Xcode** from the Mac App Store, open it once, and accept the license.
2. Install **Flutter** (https://docs.flutter.dev/get-started/install/macos) and run `flutter doctor` until iOS shows a green check.
3. **Xcode → Settings → Accounts → +** and sign in with the Apple ID that owns the developer account (team `57539PPNC3`).
4. Get the code:

   ```bash
   git clone https://github.com/CarlosLavayenJr/Claymore-Website.git
   cd Claymore-Website/mobile
   git checkout dev
   flutter pub get
   ```

## 2. Create the app in App Store Connect (once)

https://appstoreconnect.apple.com → **Apps → + → New App**

| Field | Value |
| --- | --- |
| Platforms | iOS |
| Name | Claymores RFC |
| Primary language | English (U.S.) |
| Bundle ID | `com.claymoresrfc.claymores` (already registered) |
| SKU | `claymores-rfc` |
| User access | Full access |

## 3. Build and upload

```bash
cd Claymore-Website/mobile
flutter build ipa --dart-define-from-file=dart_defines/production.json
```

The first time, if signing fails, open `ios/Runner.xcworkspace` in Xcode, select **Runner → Signing & Capabilities**, tick **Automatically manage signing**, pick your team, then run the command again.

Upload the result (`build/ios/ipa/*.ipa`):
- easiest: install **Transporter** from the Mac App Store, sign in, drag the `.ipa` in, click **Deliver**; or
- open `build/ios/archive/Runner.xcarchive` in Xcode → **Distribute App → App Store Connect → Upload**.

For every later upload, bump the build number in `pubspec.yaml` (`1.0.0+1` → `1.0.0+2`).

## 4. TestFlight (try it on your phone first)

In App Store Connect → your app → **TestFlight**. The build appears after 5–15 minutes of processing. Add yourself under **Internal Testing**, install the **TestFlight** app on your iPhone and open the invite. No Apple review for internal testers.

Check on your phone:
- Home, Fixtures, Standings load.
- **Sign in with Apple** and **Sign in with Google** (Club tab). An Apple account that hides its email shows a `@privaterelay.appleid.com` address: invite that address in Club Admin, or sign in with Google instead.
- Dues show up after you assign some in Club Admin.

## 5. The listing

**Screenshots:** `mobile/store/screenshots/` (1320 × 2868, the 6.9" iPhone size; Apple scales them down for smaller phones). Upload in order 1–4.

| Field | Text |
| --- | --- |
| Subtitle (30) | Orlando rugby, in your pocket |
| Category | Sports |
| Support URL | https://www.claymoresrfc.com/contact |
| Marketing URL | https://www.claymoresrfc.com |
| Privacy Policy URL | https://www.claymoresrfc.com/privacy |
| Copyright | 2026 Central Florida Claymores RFC |
| Age rating | Answer "None" to everything → 4+ |
| Keywords (100) | rugby,orlando,central florida,claymores,rugby union,florida rugby,fixtures,standings,club,D3 |

**Promotional text (170):**
> Next match, standings and practice times for the Central Florida Claymores — Orlando's rugby club since 2018.

**Description:**
> The official app of the Central Florida Claymores RFC, Orlando's rugby club competing in Florida Rugby Union Division 3.
>
> • Next match, kickoff time and venue, with directions
> • Full fixture list and match history with scores
> • Live Florida Rugby Union standings
> • Weekly practice times and location
>
> Club members can sign in with Apple or Google to see and pay their dues. New to rugby? Come to a practice — no experience needed.

## 6. App Privacy (App Store Connect → App Privacy)

Data collected, all **linked to the user**, **not used for tracking**, purpose **App Functionality**:
- Contact info → **Name**, **Email address** (only for members who sign in)
- **Purchases** (dues payment history; card details are handled by Stripe and never reach the app)
- Identifiers → **User ID** (the sign-in account ID)
- User content → **Other user content** (match availability answers and their notes)
- Identifiers → **Device ID**: only once push reminders ship (the device's push token, used to send match reminders)

Nothing else (no analytics, no ads, no location). Push reminders are off until the member turns on "Match updates", and iOS asks permission then.

## 7. Submit for review

1. Under the version, pick the TestFlight build.
2. **App Review Information → Sign-in required: yes.** Membership is invite-only, so create a spare Google account for Apple (e.g. `claymores.review@gmail.com`), invite it as a **player** in Club Admin, and give Apple its email and password here.
3. **Notes for the reviewer:**
   > Claymores RFC is the app of an amateur rugby club in Orlando, FL. Fixtures, results, standings and practice times are public and need no account. Sign-in (Apple or Google) is for invited club members and shows their club dues, which are paid by card through Stripe Checkout; dues are a membership fee for a real-world sports club, not digital content. Use the Google account below (Club tab → Sign in with Google) to see the member area. Accounts can be deleted in the app: Club tab → gear (Account settings) → Delete account. Push notifications are optional match reminders the member turns on; they never carry advertising.
4. **Submit for Review.** Usually 1–3 days.

Stripe is in **test mode** until the account is verified: the Pay button opens a Stripe test checkout, so no real money moves. Before going public, either switch Stripe to live keys (api/README.md, "Going live with Stripe") or turn dues off for the first release (`"ENABLE_DUES": "false"` in `dart_defines/production.json`, then a new build), so members don't "pay" with test cards.
