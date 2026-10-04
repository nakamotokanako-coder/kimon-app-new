# 決済（Stripe・月額980円）v1

2026-10-03 時点。**今はテスト環境（サンドボックス）につながっていて、実際のお金は動かない。**

## 流れ
1. 設定 → アカウントの「プロ版に申し込む」 → `POST /api/billing?action=checkout` → Stripe の決済ページへ移動
2. 支払い完了 → アプリに戻る（`/?billing=success`）。この時点ではまだ有料にしない
3. Stripe からの通知（Webhook `POST /api/billing?action=webhook`）で、サブスクを取得し直して `user:{email}` を更新
   - `status: 'paid'`、`paidUntil`（請求期間の終わり＋1日の猶予）、`stripeSubscriptionId`、`cancelAtPeriodEnd`
4. 毎月の更新（`invoice.paid`）で `paidUntil` が延びる。更新が止まれば、期限切れで自動的に無料に戻る（`lib/accessPolicy.js`）
5. 解約・カード変更・領収書は「お支払い方法の変更・解約」 → `POST /api/billing?action=portal` → Stripe のカスタマーポータル
   - 解約は「期間の終わりに反映」。それまでは有料のまま

## 実装の場所
| 役割 | 場所 |
|---|---|
| Stripe とアプリの橋渡し（顧客の対応・会員状態への変換） | `lib/billing.js` |
| 入口（Hobby プランの関数12個制限のため1つにまとめている） | `api/billing.js` |
| 申し込み・解約ページ・Webhook の処理 | `lib/billingApi/` |
| Stripe 側の初期設定（価格・ポータル・Webhook） | `scripts/stripe_setup.mjs` |
| 画面（申し込み・解約ボタン） | `src/components/AccountSettings.jsx` の `BillingSection` |

- Stripe の顧客とアプリのユーザーの対応は、KV の `stripe_customer:{顧客ID}` → メールアドレス。
- 価格IDはコードにも環境変数にも持たず、`lookup_key = kimon_pro_monthly` で引く。
- 返金・異議・不正の警告は `billing_alert:*` に180日記録する。

## 環境変数（Vercel・値はコードに書かない）
| 名前 | 用途 |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe の API キー（Vercel の Stripe 連携が自動で設定） |
| `STRIPE_RESTRICTED_KEY` | 権限を絞ったキー（任意。あればこちらを優先して使う。本番では推奨） |
| `STRIPE_WEBHOOK_SECRET` | Webhook の署名検証用（Production に登録済み・テスト環境のもの） |

## 申し込みボタンの表示
- ベータ期間中（`ACCESS_MODE='beta'`）は、申し込みボタンを一般には出さない。
- 動作確認するときは、アドレスに `?billing=preview` を付けて開く（その端末にだけ表示される）。
- `ACCESS_MODE='paid'` にすると全員に表示される。

## テストのしかた（テスト環境）
1. アプリを `https://kimon-tonko.vercel.app/?billing=preview` で開いてログイン
2. 設定 → アカウント → 「プロ版に申し込む」
3. Stripe の決済ページで、Stripe のテスト用カード番号を入力（実際の請求は発生しない）
4. アプリに戻り、数秒後に「有料会員（◯/◯/◯ まで）」と表示されれば成功
5. 「お支払い方法の変更・解約」から解約 → 「解約の手続き済みです」と表示される

## 本番で課金を始めるまでにやること
1. Stripe のアカウント登録・本人確認（運営者本人の手続き）と、サンドボックスの引き取り（`vercel integration resource claim`）
2. 特定商取引法に基づく表記・利用規約・プライバシーポリシーを掲載（`docs/legal/`）
3. 本番用のキーで `scripts/stripe_setup.mjs` を実行（価格・ポータル・Webhook を本番に作成）し、本番の `STRIPE_WEBHOOK_SECRET` を登録
4. 権限を絞ったキー（`STRIPE_RESTRICTED_KEY`）に切り替える
5. `lib/accessPolicy.js` の `ACCESS_MODE` を `'paid'` に変更
6. 消費税: 価格は税込980円として登録している（`tax_behavior: 'inclusive'`）。Stripe Tax は有効にしていない。
   海外の利用者に販売する場合や、インボイス（適格請求書）の対応が必要な場合は、税理士に確認のうえ Stripe Tax の設定を検討する

## 端末をまたいだ保存（お気に入り・基準点）
- **設定で「お気に入りを他の端末でも使う」をオンにした人だけ**、お気に入りと基準点をアカウントに保存する（最初はオフ。場所の情報なので本人が選ぶ）。
- 保存先は KV の `userdata:{email}`（会員情報 `user:{email}` とは別のキー）。このキーがある＝オン。オフにするとキーごと消す（端末の分は残る）。
- 他の端末でオフにされたら、次の同期でその端末もオフに戻る（端末のお気に入りは消さない）。
- 入口は `GET / PUT / DELETE /api/auth/me?data=1`（関数12個制限のため `me` に同居）。処理は `lib/userData.js`、画面側は `src/sync/userDataSync.js`。
- 画面は今までどおり端末の保存を読み書きし、同期はその裏で行う。通信に失敗しても画面は動き、次の機会に送り直す。
- 初めての同期は端末とアカウントを足し合わせる。以後は「後から変えたほう」を採り、2台で同時に変えたときは足し合わせる。
- 現在地（GPS）を基準点にしている場合は保存しない（端末ごとのものなので）。
- 退会の機能を作るときは `userdata:{email}` も消すこと。

## 年額プラン（2026-10-04 追加）
- **年額10,000円（税込）**・1年ごとに自動更新。Stripe の価格は `lookup_key = kimon_pro_annual`（月額と同じ商品にぶら下げる）。
- 申し込みは `POST /api/billing?action=checkout&plan=annual`。指定なしは月額。
- 年額かどうかは、サブスクの請求の間隔で決める（`lib/billing.js` の `planOfSubscription`）。Webhook が `user.plan`（`'annual'` / `'monthly'`）に書き込み、`/api/auth/me` が返す。
- 月額 ⇔ 年額 の切り替えは、カスタマーポータルで行う（`scripts/stripe_setup.mjs` が有効にする。差額は日割り）。
- **年額だけの機能**: 吉日・吉方位の検索で、3ヶ月・半年・1年の期間（月額の人も鍵つき）。
  切り替えは `lib/accessPolicy.js` の `LONG_RANGE_REQUIRES_ANNUAL`。
  - この鍵は画面側の制限（検索の計算は端末の中で行っている）。普通の使い方では越えられないが、仕組み上、完全に防ぐものではない。
- テスト環境には年額の価格を作成済み。本番で始めるときは、本番のキーで `scripts/stripe_setup.mjs` を実行する。
