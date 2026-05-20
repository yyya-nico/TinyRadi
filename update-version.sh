#!/bin/bash

# 現バージョンを取得
CURRENT_VERSION=$(grep '"version"' package.json | head -1 | sed 's/.*"version": "\([^"]*\)".*/\1/')

echo "現在のバージョン: $CURRENT_VERSION"
read -p "新しいバージョンを入力してください: " VERSION

if [ -z "$VERSION" ]; then
    echo "バージョンが入力されていません。"
    exit 1
fi

# package.jsonを更新
echo "package.json を更新中..."
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" package.json

# manifest.jsonを更新
echo "manifest.json を更新中..."
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION\"/" public/manifest.json

# git tagを作成
echo "git tag を作成中..."
git tag "v$VERSION"

# git add と commit
echo "ファイルをコミット中..."
git add package.json public/manifest.json
git commit -m "Update version to $VERSION"

# push するか確認
read -p "git push と git push origin v$VERSION を実行しますか？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Pushing..."
    git push
    git push origin "v$VERSION"
    echo "完了しました！"
else
    echo "スキップしました。"
fi

# ビルドとzipを作成するか確認
read -p "ビルドしてzipを作成しますか？(y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "ビルド中..."
    npm run build
    echo "zip ファイルを作成中..."
    cd dist
    zip -r "TinyRadi-v$VERSION.zip" ./* -x "*.DS_Store" "*__MACOSX*"
    cd ..
    echo "完了しました！"
else
    echo "スキップしました。"
fi
