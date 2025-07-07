# Rippler

**Rippler** は、要素に水面のような波紋（リップル）エフェクトを生成する、依存ライブラリなしの軽量な JavaScript ライブラリです。

このプロジェクトは、[@sirxemic](https://github.com/sirxemic) 氏によるオリジナルの [jquery.ripples](https://github.com/sirxemic/jquery.ripples) をベースに、**jQuery依存を排除**し、**モダンなJavaScript（ES2023）** で全面的に書き直されたフォークです。

WebGL によるハードウェアアクセラレーションを活用することで、あらゆる背景画像に対して、滑らかで高性能な視覚効果を提供します。
マウスやタッチ操作にも反応し、インタラクティブで印象的なユーザー体験を実現します。

## 特徴

- **依存ライブラリ不要**  
  jQueryなどの外部ライブラリに依存せず、純粋なJavaScriptで動作します。

- **高パフォーマンス**  
  WebGLによるハードウェアアクセラレーションを活用し、滑らかで高効率なアニメーションを実現します。

- **高いカスタマイズ性**  
  解像度、波紋の半径、乱れ（ディストーション）の強さなど、さまざまなパラメータを柔軟に調整可能です。

- **インタラクティブな演出**  
  マウスの動きやタッチ操作に反応して、リアルタイムに波紋を生成します。

- **導入が簡単**  
  シンプルな初期化と設定オプションで、すぐに使用開始できます。ES Modules 対応で、モダンなフロントエンド環境にもスムーズに統合可能です。

## デモ

`index.html`ファイルをウェブブラウザで開くことで、ライブデモを確認できます。

<!-- 以下にエフェクトのスクリーンショットやGIFアニメーションを追加できます -->
<!-- ![Rippler Demo](./demo.gif) -->

![Rippler Demo](/demo/demo.gif)

## 設定

`Ripples`コンストラクタは、以下のプロパティを持つオプションオブジェクトを受け付けます：

| プロパティ     | 型        | デフォルト値 | 説明                                                                 |
|----------------|-----------|--------------|----------------------------------------------------------------------|
| `resolution`   | `number`  | `256`        | WebGLテクスチャの解像度。値を大きくすると波紋が滑らかになりますが、処理負荷が増します。 |
| `dropRadius`   | `number`  | `20`         | 波紋の半径（ピクセル単位）。大きいほど広範囲に波紋が広がります。            |
| `perturbance`  | `number`  | `0.03`       | 波紋による視覚的な歪みの強さ。数値を大きくすると、水面の乱れが激しくなります。 |
| `interactive`  | `boolean` | `true`       | マウス移動やタッチ操作に反応するかどうか。`false` にすると静的な演出になります。|
| `imageUrl`     | `string`  | `null`       | 背景画像のURL。指定すると要素のCSS背景を上書きして画像を使用します。          |
| `crossOrigin`  | `string`  | `""`         | 背景画像を読み込む際の CORS 設定。通常は空文字で問題ありません。              |


## ビルド

Rippler のソースコードを自分で改変してビルドしたい場合は、以下の手順に従ってください。  
※通常の利用であれば、ビルド済みファイルを使用するだけで十分です。コントリビュートやカスタマイズを行う場合に限り、以下のビルド手順が必要です。

### 必要なもの

- **Deno 2.4 以降**  
  このプロジェクトは Deno を使って開発・ビルドされています。

### 手順

1. プロジェクトをクローンまたはZIPでダウンロードします。
    ```bash
    git clone https://github.com/your-username/rippler.git
    cd rippler
    ```

2. ビルドコマンドを実行します。
    ```bash
    deno task build
    ```

3. `/dist/` フォルダ内にビルド済みのスクリプトファイルが生成されます。

## ライセンス

このプロジェクトはMITライセンスのもとで公開されています。
このプロジェクトはフォークであるため、元の作品である[jquery.ripples](https://github.com/sirxemic/jquery.ripples)のライセンスに従います。
詳細は[LICENSE](LICENSE)ファイルをご覧ください。

## プロジェクト内で使用されているアセットのライセンス

- Photo by [Marissa Rodriguez](https://unsplash.com/@marissar_?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/photos/2mKYEVGA4jE?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText)

