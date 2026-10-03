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
