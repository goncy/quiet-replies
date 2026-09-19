# Quiet Replies

A small Chrome extension that marks or collapses X replies that appear to be AI-written. Powered by [Jev](https://vercel.com/ai-gateway/models/jev) through Vercel AI Gateway, using your own API key.

## Install

Requires Node.js 22+ and Chrome 123+.

```sh
git clone https://github.com/goncy/quiet-replies.git
cd quiet-replies
npm ci
npm run build
```

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select the `quiet-replies` folder, not `dist`.
3. Open the extension popup and enter your [AI Gateway API key](https://vercel.com/docs/ai-gateway/authentication-and-security/authentication#api-key).
4. Reload X, open a tweet, and click the crossed-out bot beside Grok in its header. If Grok is absent, the button appears beside the More menu.

The button turns blue with a check mark when enabled and pulses while analyzing replies. The filter starts off when you navigate to another tweet.

No application server or Vercel deployment is needed. Model usage is billed to your Gateway account.

## Use

Every analyzed reply gets a bot icon and percentage beside Grok. Replies with an estimated probability **at or above 50%** receive a yellow border that stays visible on hover. Lower estimates have a neutral badge. Displayed percentages are rounded; filtering uses the unrounded value.

Choose a mode in the popup:

- **Mark:** keep all replies visible and highlight probable bots.
- **Collapse:** hide the body of flagged replies, keeping their author, badge, and a **Show** button.

The model compares each reply with the original tweet, with particular attention to paraphrases, generic praise, and polished restatements that add no substance. These are model estimates, not proof of authorship. Human replies can be misclassified.

The extension analyzes loaded text replies as you scroll. It does not scroll, expand threads, or fetch hidden replies. Up to three requests run at once. Successful results stay in tab memory, keyed by original tweet and reply, until reload or close. Turning the filter off removes its marks and stops new requests; requests already running can finish.

If a request fails, new analysis pauses and an error appears on the original tweet. Check your key, credits, or connection, then toggle off and on to retry. Requests time out after 20 seconds and do not retry automatically.

## Privacy

- Each request sends the original tweet's text and one reply's text to Vercel AI Gateway for evaluation by Jev. Profiles, usernames, avatars, engagement counts, media, and quoted-tweet text are not collected separately. Anything written in the tweet text itself is included.
- Your API key and display mode are stored in `chrome.storage.local`, not Chrome Sync or project files. The extension restricts storage access to its popup and service worker; the content script receives only the display mode and evaluation results. The key is not encrypted by the extension.
- The key is used to authenticate Gateway requests. It is never embedded in the source or build. Only classification results are cached, in tab memory.
- There is no analytics or application backend. The extension requests local storage access and access to `x.com` and `ai-gateway.vercel.sh`.

## Development

```sh
npm run check
npm run build
```

`check` validates JavaScript syntax. `build` bundles the service worker into `dist/background.js`. Reload the extension and X after changes. Dependencies and build output are ignored by Git, so a fresh clone must be built before loading it in Chrome.

| File | Purpose |
| --- | --- |
| `content.js` | Read rendered tweets, queue evaluations, cache results, and update the page. |
| `content.css` | Toggle, badge, highlight, and collapsed-reply styles. |
| `background.js` | Keep the API key private and call the AI SDK evaluation API. |
| `popup.html` / `popup.js` | Configure the key and display mode. |
| `manifest.json` | Chrome permissions and extension entry points. |

There is one runtime dependency (`ai`) and one build dependency (`esbuild`). Versions are pinned because the AI SDK evaluation API is experimental. All scripts run from local extension files.

For manual verification, check toggle placement, badges below 50%, highlighting and collapsing at 50%, hover borders, mode changes, navigation, and turning the filter off during analysis. Classification quality needs real Gateway responses; syntax and build checks do not measure it.

X's DOM is not a stable API. Markup changes may require selector updates. The extension supports standard `x.com/<user>/status/<id>` pages, skips ancestor tweets and sections separated by timeline headings, and ignores replies without text. The home feed and media viewers are outside its scope.
