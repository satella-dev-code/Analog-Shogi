const translations = {
  '全画面表示': 'Enter fullscreen', '全画面を終了': 'Exit fullscreen', 'このブラウザでは全画面表示を利用できません。': 'Fullscreen is not available in this browser.', '全画面表示を開始できませんでした。': 'Unable to enter fullscreen.', '全画面表示を終了できませんでした。': 'Unable to exit fullscreen.', 'アナログ将棋': 'Analog Shogi', 'マス目を無くした、どこにでも置ける将棋': 'No grid. Move freely.', 'ルール': 'Rules', '範囲': 'Range', '危険': 'Threats', '自分': 'You', '相手': 'Opp.',
  '作成者 SateLLA': 'Created by SateLLA', '先手': 'Sente', '後手': 'Gote', 'なし': 'None', '持ち駒なし': 'No pieces in hand', '待った': 'Undo', '反転': 'Flip', '盤の反転': 'Flip board', '投了': 'Resign', '新規対局': 'New game', '解除': 'Cancel', '棋譜': 'Moves',
  '成りますか？': 'Promote this piece?', '成らない': 'Keep', '成る': 'Promote', 'キャンセル': 'Cancel', '確定': 'Confirm', '閉じる': 'Close',
  '移動': 'Movement', '王': 'King', '歩': 'Pawn', '金・銀': 'Gold / Silver', '飛・角・香': 'Rook / Bishop / Lance', '桂': 'Knight', '成駒': 'Promoted pieces',
  '駒取り・成り': 'Captures & promotion', '勝敗': 'Winning', '操作・保存': 'Controls & saving',
  '自分の範囲': 'Your movement ranges', '相手の範囲': 'Opponent movement ranges', '自分の危険': 'Your threatened pieces', '相手の危険': 'Opponent threatened pieces',
  '移動範囲の表示': 'Movement range display', '危険な駒のハイライト': 'Threat highlights', '将棋盤と持ち駒': 'Board and pieces in hand',
  '後手の持ち駒': 'Gote pieces in hand', '先手の持ち駒': 'Sente pieces in hand', '対局操作': 'Game controls', '盤の上下を反転': 'Flip board',
  '選択した駒の移動': 'Selected piece preview', '移動先の座標': 'Destination coordinates', '指し手の履歴': 'Move history', 'ルールを閉じる': 'Close rules',
  '将棋盤。駒を選んで移動先を指定。矢印キーで移動先を調整、Enterで確定。': 'Board. Select a piece and a destination. Adjust with arrow keys and confirm with Enter.',
  '自動保存できません。': 'Unable to save automatically.', '着手なし': 'No moves yet', '打てます': 'Drop here', '移動できます': 'Move here',
  '薄緑：打てる場所 ／ 青：置いた後の移動範囲': 'Green: drop locations / Blue: range after placement',
  '対局は終了しています。': 'The game has ended.', '手番の駒を選んでください。': 'Select a piece belonging to the side to move.',
  '駒全体が盤内に収まる位置を選んでください。': 'Keep the entire piece inside the board.', 'この駒の移動範囲の外です。': 'Outside this piece’s range.',
  '味方の駒と重なる位置には移動できません。': 'Cannot overlap a friendly piece.', '敵2枚に同時に重なる位置には移動できません。': 'Cannot overlap two enemy pieces at once.',
  '王は取らず、王手と投了で決着します。': 'Kings are not captured. Use check and resignation.', '移動経路がほかの駒に遮られています。': 'Another piece blocks this path.',
  '自分の王が王手になるため指せません。': 'This move would leave your king in check.', '持ち駒を選んでください。': 'Select a piece from your hand.',
  'ほかの駒と重なる位置には打てません。': 'Cannot drop on another piece.', '次に動けなくなる位置には打てません。': 'This piece would have no future move.', '自分の王の王手を解消してください。': 'The drop must get your king out of check.',
  '新しい対局を始めますか？': 'Start a new game?', '現在の対局と棋譜を消して、初期配置に戻します。': 'This clears the current game and move history.',
  '2人で交互に操作します。駒を選び、移動先をクリックするかドラッグしてください。移動範囲の色は目安です。選択中の駒の黄土色の領域は駒取りできる範囲です。ほかの駒や王手によって動けない場所もあります。': 'Two players take turns. Select a piece and click a destination, or drag it. Shaded ranges are a guide; ochre marks capture areas. Other pieces and king safety can restrict a move.',
  '「自分の範囲」は手番側を青、「相手の範囲」は反対側を橙で表示します。両方同時に表示できます。範囲は経路と駒の重なりを反映した目安で、自玉の王手は移動先で判定します。取られそうな駒は、自分が青、相手が橙の縁です。「自分の危険」「相手の危険」でそれぞれ表示を切り替えられます。王手の表示は常に残ります。': 'You means the side to move (blue); Opponent is the other side (orange). Show either or both ranges. Paths and overlaps are included; king safety is checked at the destination. Threatened pieces use the same colors and can be toggled independently. Check alerts remain visible.',
  '全方向に距離2.0以内。': 'Any direction, up to 2.0 units.',
  '前方2.0、幅1.2の長方形。横だけ・後ろへの移動は不可。': 'A forward rectangle, 2.0 long and 1.2 wide. No purely sideways or backward moves.',
  '通常将棋の移動方向に左右22.5度の扇形。金は距離2.0、銀は2.2以内。': 'Sectors extending 22.5° to either side of the standard shogi directions. Gold: up to 2.0; Silver: up to 2.2.',
  '通常の射線を中心とする幅1.2の帯。距離は自由。香は前方のみ。': 'Bands 1.2 units wide around the standard shogi lines, with unlimited distance. Lances move forward only.',
  '前に3.2、左右に1.6の2点から半径0.95以内。他の駒を飛び越えます。': 'Land within 0.95 of either point 3.2 forward and 1.6 to the left or right. Knights jump over pieces.',
  '歩・香・桂・銀は金の動き。馬・龍は元の動きに全方向・距離2.0以内を追加。': 'Promoted pawns, lances, knights and silvers move as golds. Promoted bishops and rooks add movement up to 2.0 in any direction.',
  '移動先で敵1枚と重なれば取れ、指定した位置に止まります。味方や敵2枚との同時重なりは禁止です。持ち駒は空いた場所へ打てます。全駒共通で、移動の中心線が他の駒に当たらなければ進めます。桂だけは途中の駒を飛び越えられます。持ち駒を重ねて打って取ることはできません。盤の幅は12、駒の直径は0.7です。': 'Overlap exactly one enemy at the destination to capture it and stop at your chosen coordinates. Friendly overlaps and overlapping two enemies are prohibited. Drop pieces from your hand onto empty space; drops cannot capture. Every piece can move if its center line clears other pieces; knights can jump. The board is 12 units wide and pieces are 0.7 in diameter.',
  '奥行き4の敵陣に移動前か移動後の中心が入ると成れます。次に動けなくなる歩・香・桂は強制成り。その位置への打ちは禁止です。': 'Promotion is optional when the starting or ending center is in the opponent’s 4-unit-deep zone. Pawns, lances and knights must promote if they would otherwise have no future move. Drops to such positions are prohibited.',
  '王に重なる位置へ相手が動ける状態が王手です。自分の王を王手にさらす手は禁止。詰みの自動判定はないため、投了で決着します。二歩・打ち歩詰めは禁止していません。千日手・持将棋の判定はありません。': 'Your king is in check if an opponent can move to overlap it. You cannot leave your king in check. Checkmate is not detected automatically; resign to end the game. Multiple pawns in a file and pawn-drop mate are allowed. Repetition and impasse are not detected.',
  'TabとEnterで駒を選択。盤上で矢印キーで移動先を調整し、Enterで確定します。刻みは0.1、Shiftで0.5、Altで0.01。Escで解除。': 'Use Tab and Enter to select a piece. On the board, adjust the destination with arrow keys and confirm with Enter. Steps: 0.1, Shift for 0.5, Alt for 0.01. Esc cancels.',
  '持ち駒を選ぶと薄緑で打てる場所を表示します。持ち駒・盤上の駒ともに、候補位置に持っている駒を表示します。候補位置の青い範囲は、置いた後の移動範囲の目安です。': 'Select a piece in hand to show drop locations in pale green. Both moves and drops show the held piece at the candidate position, with its range after placement in blue.',
  '対局はこのブラウザに自動保存します。待ったは最大100操作まで戻せます。': 'Games are saved automatically in this browser. Undo up to 100 actions.',
};
export const englishPieces = { 王: 'King', 飛: 'Rook', 角: 'Bishop', 金: 'Gold', 銀: 'Silver', 桂: 'Knight', 香: 'Lance', 歩: 'Pawn', 龍: 'Dragon', 馬: 'Horse', 全: 'Promoted silver', 圭: 'Promoted knight', 杏: 'Promoted lance', と: 'Promoted pawn' };
let language = 'ja';
try { if (localStorage.getItem('analog-shogi-language') === 'en') language = 'en'; } catch {}
export const getLanguage = () => language;
export const t = text => language === 'en' ? translations[text] ?? text : text;
export const sideName = side => language === 'en' ? (side === 'sente' ? 'Sente' : 'Gote') : (side === 'sente' ? '先手' : '後手');
export const pieceName = symbol => language === 'en' ? englishPieces[symbol] ?? symbol : symbol;
export function setLanguage(value) {
  language = value === 'en' ? 'en' : 'ja';
  try { localStorage.setItem('analog-shogi-language', language); } catch {}
}
const staticTexts = [], attributes = [];
export function captureTranslations(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) if (translations[node.textContent.trim()]) staticTexts.push([node, node.textContent]);
  for (const element of root.querySelectorAll('[aria-label], [title]')) for (const attr of ['aria-label', 'title']) {
    const text = element.getAttribute(attr);
    if (text && translations[text]) attributes.push([element, attr, text]);
  }
}
export function applyLanguage() {
  document.documentElement.lang = language;
  document.title = language === 'en' ? 'Analog Shogi | Free Gridless Shogi Browser Game' : 'アナログ将棋｜マス目のない無料ブラウザ将棋ゲーム';
  document.querySelector('meta[name="description"]')?.setAttribute('content', language === 'en' ? 'Shogi without a grid. Place your pieces anywhere. A free browser game for two players on one device.' : 'マス目を無くした、どこにでも置ける将棋。同じ端末で2人で遊べる無料ブラウザゲーム。');
  for (const [node, source] of staticTexts) node.textContent = source.replace(source.trim(), t(source.trim()));
  for (const [element, attr, source] of attributes) element.setAttribute(attr, t(source));
}
export function historyText(text) {
  if (language !== 'en') return text;
  let match = text.match(/^(.+?)打 (\(.*\))$/);
  if (match) return `Drop ${pieceName(match[1])} ${match[2]}`;
  match = text.match(/^(.+?) → (\([^)]*\))(?: (.+?)取り)?( 成)?$/);
  if (!match) return text;
  return `${pieceName(match[1])} → ${match[2]}${match[3] ? ` · takes ${pieceName(match[3])}` : ''}${match[4] ? ' · promotes' : ''}`;
}
