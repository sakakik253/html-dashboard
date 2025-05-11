/**
 * HTMLファイル汎用解析と目次連動機能
 * 
 * 異なる構造のHTMLファイルを解析し、目次構造を抽出して
 * ダッシュボードに取り込むための汎用的な機能を提供します。
 */

// HTML解析と目次抽出機能
class HTMLAnalyzer {
    constructor() {
        // 一般的な目次要素のセレクタパターン （優先度順）
        this.tocSelectors = [
            '.nav-menu .nav-item',    // paste.txt, paste-3.txt
            '.sidebar-menu .menu-item', // paste-2.txt
            '.toc-menu li',           // その他の可能性
            '.sidebar ul li',         // 一般的なサイドバー
            'nav ul li',              // 標準的なナビゲーション
            '.sidebar-section ul li', // 構造化されたサイドバー
            '[class*="nav"] [class*="item"]', // クラス名にnavとitemを含む要素
            'aside ul li',            // aside内のリスト項目
            '.side-menu li, .sidemenu li' // 一般的なサイドメニュー
        ];
        
        // 一般的なスライド要素のセレクタパターン
        this.slideSelectors = [
            '.slide',                 // 共通
            '.content-section',       // 別の可能性
            '#slide-1, #slide1, [id^="slide"]', // ID属性でスライドを識別
            '.page, .section',        // 別の可能性
            'article, section',       // 標準的なコンテンツ
            '[class*="slide"], [class*="content"]', // クラス名にslideやcontentを含む要素
            'main > div'              // mainの直下のdiv (最後の手段)
        ];
    }

    /**
     * HTMLコンテンツを解析して目次構造とスライド情報を抽出
     * 
     * @param {string} htmlContent - 解析するHTMLコンテンツ
     * @return {Object} 目次情報とスライド情報を含むオブジェクト
     */
    analyze(htmlContent) {
        // HTML解析用のパーサー
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // タイトル取得
        const title = doc.title || '取り込みファイル';
        
        // 目次情報抽出
        const tocItems = this.extractTocItems(doc);
        
        // スライド情報抽出
        const slides = this.extractSlides(doc);
        
        // スタイル情報抽出
        const styles = this.extractStyles(doc);
        
        // スクリプト情報抽出
        const scripts = this.extractScripts(doc);
        
        return {
            title,
            tocItems,
            slides,
            styles,
            scripts
        };
    }

    /**
     * 目次項目を抽出
     * 
     * @param {Document} doc - パースされたHTMLドキュメント
     * @return {Array} 目次項目の配列
     */
    extractTocItems(doc) {
        let tocItems = [];
        let bestMatchCount = 0;
        
        // 各セレクタパターンを試して目次項目を見つける
        for (const selector of this.tocSelectors) {
            try {
                const items = doc.querySelectorAll(selector);
                if (items.length > bestMatchCount) {
                    // 目次項目候補が見つかった場合、情報を抽出
                    const extractedItems = Array.from(items).map(item => {
                        // スライドIDのパターンを検出（複数の可能性をチェック）
                        const slideAttr = item.getAttribute('data-slide');
                        const idAttr = item.getAttribute('id');
                        const href = item.querySelector('a')?.getAttribute('href');
                        let slideId = slideAttr;
                        
                        // data-slide属性がない場合、他の属性を順番にチェック
                        if (!slideId && href) {
                            // href属性からIDを抽出 (#slide1 -> slide1 または #slide-1 -> slide-1)
                            slideId = href.replace('#', '');
                        } else if (!slideId && idAttr && (idAttr.includes('slide') || idAttr.includes('item'))) {
                            // id属性に「slide」または「item」が含まれている場合
                            slideId = idAttr;
                        } else if (!slideId) {
                            // ヒューリスティックな対応：index + 1 をIDとして使用
                            const index = Array.from(items).indexOf(item);
                            slideId = `slide-${index + 1}`;
                        }
                        
                        // アイコン情報を取得
                        const iconElement = item.querySelector('i, .icon');
                        const iconClass = iconElement ? iconElement.className : '';
                        
                        // テキスト内容を取得
                        let text = item.textContent.trim().replace(/\s+/g, ' ');
                        
                        // aタグがある場合はその中のテキストを優先
                        const link = item.querySelector('a');
                        if (link) {
                            text = link.textContent.trim().replace(/\s+/g, ' ');
                        }
                        
                        // テキスト内容から余分なもの（アイコンフォントの文字など）を除去
                        text = text.replace(/^\s*[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\uFF00-\uFFEF]\s*/, '');
                        
                        // テキストが空の場合はIDをテキストとして使用
                        if (!text) {
                            text = `項目 ${slideId}`;
                        }
                        
                        return {
                            id: slideId,
                            text: text,
                            iconClass: iconClass,
                            isActive: item.classList.contains('active'),
                            originalElement: item
                        };
                    });
                    
                    // 有効な項目（IDとテキストが揃っている）だけをフィルタリング
                    const validItems = extractedItems.filter(item => item.id && item.text);
                    
                    // 最良の一致として記録
                    if (validItems.length > bestMatchCount) {
                        tocItems = validItems;
                        bestMatchCount = validItems.length;
                    }
                }
            } catch (error) {
                console.warn(`セレクタ "${selector}" の処理中にエラーが発生しました:`, error);
                // エラーが発生しても処理を続行
            }
        }
        
        // 目次項目が見つからなかった場合、構造から自動生成を試みる
        if (tocItems.length === 0) {
            // 見出し要素から目次構造を抽出する代替手段
            const headings = doc.querySelectorAll('h1, h2, h3, h4');
            if (headings.length > 0) {
                tocItems = Array.from(headings).map((heading, index) => {
                    const headingLevel = parseInt(heading.tagName.substring(1));
                    const slideId = `heading-${index + 1}`;
                    heading.id = slideId; // 見出しにIDを付与（あとでジャンプできるように）
                    
                    return {
                        id: slideId,
                        text: heading.textContent.trim(),
                        iconClass: '',
                        isActive: index === 0, // 最初の見出しをアクティブに
                        level: headingLevel
                    };
                });
            }
        }
        
        return tocItems;
    }

    /**
     * スライド要素を抽出
     * 
     * @param {Document} doc - パースされたHTMLドキュメント
     * @return {Array} スライド情報の配列
     */
    extractSlides(doc) {
        let slides = [];
        let bestMatchCount = 0;
        
        // 各セレクタパターンを試してスライド要素を見つける
        for (const selector of this.slideSelectors) {
            try {
                const elements = doc.querySelectorAll(selector);
                if (elements.length > 0) {
                    // スライド要素候補が見つかった場合、情報を抽出
                    const extractedSlides = Array.from(elements).map((element, index) => {
                        // ID抽出 (id属性があればそれを、なければ位置インデックスを使用)
                        const id = element.id || 
                                  element.getAttribute('data-slide') || 
                                  element.getAttribute('data-id') || 
                                  `slide-${index + 1}`;
                        
                        // タイトル抽出
                        const title = this.extractSlideTitle(element);
                        
                        // アクティブ状態チェック
                        const isActive = element.classList.contains('active');
                        
                        return {
                            id: id,
                            content: element.outerHTML,
                            title: title,
                            isActive: isActive,
                            originalElement: element
                        };
                    });
                    
                    // 最良の一致として記録（最も多くのスライド要素が見つかったものを採用）
                    if (elements.length > bestMatchCount) {
                        slides = extractedSlides;
                        bestMatchCount = elements.length;
                    }
                }
            } catch (error) {
                console.warn(`セレクタ "${selector}" の処理中にエラーが発生しました:`, error);
                // エラーが発生しても処理を続行
            }
        }
        
        // スライドが見つからない場合は、ドキュメント自体を1つのスライドとして扱う
        if (slides.length === 0) {
            const contentElement = doc.querySelector('body > main') || 
                                 doc.querySelector('body > div') || 
                                 doc.querySelector('body');
            
            if (contentElement) {
                slides = [{
                    id: 'main-content',
                    content: contentElement.innerHTML,
                    title: doc.title || '無題',
                    isActive: true
                }];
            }
        }
        
        // 抽出した目次項目とスライドのIDを照合し、一致させる
        this.alignTocAndSlides(doc, slides);
        
        return slides;
    }
    
    /**
     * 目次とスライドのIDを照合して一致させる
     * 
     * @param {Document} doc - パースされたHTMLドキュメント
     * @param {Array} slides - 抽出されたスライド情報
     */
    alignTocAndSlides(doc, slides) {
        // まず目次情報を取得
        const tocItems = this.extractTocItems(doc);
        
        // 目次項目がある場合、スライドIDと照合
        if (tocItems.length > 0 && slides.length > 0) {
            // 目次項目の数とスライドの数が一致する場合、順番に割り当て
            if (tocItems.length === slides.length) {
                tocItems.forEach((item, index) => {
                    // 目次項目のIDをスライドIDに反映
                    if (item.id && slides[index]) {
                        slides[index].tocId = item.id;
                    }
                });
            } else {
                // 数が一致しない場合、IDを見て照合を試みる
                tocItems.forEach(item => {
                    if (item.id) {
                        // 対応するIDを持つスライドを検索
                        const matchedSlide = slides.find(slide => 
                            slide.id === item.id || 
                            slide.id === `slide-${item.id}` || 
                            slide.id === `slide${item.id}`
                        );
                        
                        if (matchedSlide) {
                            matchedSlide.tocId = item.id;
                        }
                    }
                });
            }
        }
    }

    /**
     * スライドからタイトルを抽出
     * 
     * @param {Element} slideElement - スライド要素
     * @return {string} 抽出されたタイトル
     */
    extractSlideTitle(slideElement) {
        // 一般的なタイトル要素のセレクタ（優先度順）
        const titleSelectors = [
            '.slide-title', 
            '.section-title', 
            '.concept-title', 
            '.content-title',
            'h1', 'h2', 'h3', 
            '[class*="title"]', // titleを含むクラス
            'strong', 'b',      // 太字要素
            'header'            // ヘッダー要素
        ];
        
        for (const selector of titleSelectors) {
            try {
                const titleElement = slideElement.querySelector(selector);
                if (titleElement) {
                    // テキスト内容を抽出し、余分な空白を削除
                    let title = titleElement.textContent.trim().replace(/\s+/g, ' ');
                    
                    // アイコンなどの特殊文字を削除
                    title = title.replace(/^\s*[\u2000-\u206F\u2E00-\u2E7F\u3000-\u303F\uFF00-\uFFEF]\s*/, '');
                    
                    // 長すぎるタイトルを短縮
                    if (title.length > 50) {
                        title = title.substring(0, 47) + '...';
                    }
                    
                    if (title) {
                        return title;
                    }
                }
            } catch (error) {
                // エラーが発生しても他のセレクタを試す
                console.warn(`タイトル抽出中にエラー (${selector}):`, error);
            }
        }
        
        // 何も見つからない場合はスライド要素自体のテキスト内容から推測
        try {
            const fullText = slideElement.textContent.trim();
            if (fullText) {
                // 最初の40文字を取得し、文章の区切りで切る
                const shortText = fullText.substring(0, 40).split(/[.。!！?？]/)[0];
                if (shortText.length > 0) {
                    return shortText + (shortText.length >= 40 ? '...' : '');
                }
            }
        } catch (error) {
            console.warn('テキスト内容からのタイトル抽出中にエラー:', error);
        }
        
        // タイトル要素が見つからない場合
        return '無題のスライド';
    }

    /**
     * スタイル情報を抽出
     * 
     * @param {Document} doc - パースされたHTMLドキュメント
     * @return {Array} スタイル情報の配列
     */
    extractStyles(doc) {
        // style要素とlinkでcssを参照している要素を抽出
        const styleElements = doc.querySelectorAll('style');
        const linkElements = doc.querySelectorAll('link[rel="stylesheet"]');
        
        const styles = [];
        
        // インラインスタイルを追加
        styleElements.forEach(style => {
            styles.push({
                type: 'inline',
                content: style.textContent
            });
        });
        
        // 外部スタイルシートを追加
        linkElements.forEach(link => {
            styles.push({
                type: 'external',
                href: link.href
            });
        });
        
        return styles;
    }

    /**
     * スクリプト情報を抽出
     * 
     * @param {Document} doc - パースされたHTMLドキュメント
     * @return {Array} スクリプト情報の配列
     */
    extractScripts(doc) {
        const scriptElements = doc.querySelectorAll('script');
        
        const scripts = [];
        
        scriptElements.forEach(script => {
            // 外部スクリプトか内部スクリプトかを区別
            if (script.src) {
                scripts.push({
                    type: 'external',
                    src: script.src
                });
            } else if (script.textContent.trim()) {
                scripts.push({
                    type: 'inline',
                    content: script.textContent
                });
            }
        });
        
        return scripts;
    }
}

/**
 * ダッシュボードへのHTMLファイル統合機能
 * 取り込んだHTMLファイルの目次とコンテンツを
 * ダッシュボードに統合します
 */
class HTMLIntegrator {
    constructor(dashboardElement) {
        this.dashboard = dashboardElement;
        this.analyzer = new HTMLAnalyzer();
        this.fileStore = {}; // 取り込んだファイル情報を保存
    }

    /**
     * HTMLファイルをダッシュボードに統合
     * 
     * @param {File} file - 取り込むHTMLファイル
     * @return {Promise<Object>} 処理結果
     */
    async integrateFile(file) {
        try {
            // 処理状態通知
            this.showStatusMessage(`「${file.name}」を解析中...`, 'info');
            
            // ファイルを読み込み
            const content = await this.readFileContent(file);
            
            // HTMLを解析
            const analysis = this.analyzer.analyze(content);
            
            // スタイルとスクリプトの処理
            this.processStylesAndScripts(analysis);
            
            // ファイル情報を保存
            const fileId = this.generateId();
            this.fileStore[fileId] = {
                id: fileId,
                name: file.name,
                content: content,
                analysis: analysis,
                dateAdded: new Date()
            };
            
            // ダッシュボードに目次を追加
            this.addToSidebar(fileId, analysis);
            
            // 成功メッセージを表示
            this.showStatusMessage(`「${file.name}」を正常に取り込みました`, 'success');
            
            return {
                success: true,
                fileId: fileId,
                message: `「${file.name}」を正常に取り込みました`,
                tocItems: analysis.tocItems.length,
                slides: analysis.slides.length
            };
        } catch (error) {
            console.error('ファイル取り込みエラー:', error);
            this.showStatusMessage(`「${file.name}」の取り込みに失敗しました: ${error.message}`, 'error');
            return {
                success: false,
                message: `「${file.name}」の取り込みに失敗しました: ${error.message}`
            };
        }
    }
    
    /**
     * スタイルとスクリプトの処理
     * 
     * @param {Object} analysis - 解析結果
     */
    processStylesAndScripts(analysis) {
        // スタイルの処理
        if (analysis.styles && analysis.styles.length > 0) {
            // インラインスタイルの適用
            analysis.styles.forEach(style => {
                if (style.type === 'inline' && style.content) {
                    // スタイルの適用範囲を限定するため、クラスプレフィックスを追加
                    const prefix = `.toc-content-${this.generateId()}`;
                    let modifiedStyle = style.content;
                    
                    try {
                        // CSSルールをプレフィックス付きに変換
                        modifiedStyle = this.prefixCSSRules(modifiedStyle, prefix);
                        
                        // スタイル要素を作成
                        const styleElement = document.createElement('style');
                        styleElement.textContent = modifiedStyle;
                        document.head.appendChild(styleElement);
                    } catch (error) {
                        console.warn('スタイル適用中にエラー:', error);
                    }
                }
            });
        }
        
        // スクリプトは安全性のためここでは実行しない
    }
    
    /**
     * CSSルールにプレフィックスを追加
     * 
     * @param {string} cssText - 元のCSS
     * @param {string} prefix - 追加するプレフィックス
     * @return {string} プレフィックス付きのCSS
     */
    prefixCSSRules(cssText, prefix) {
        // 簡易的なCSS解析（完全ではない）
        return cssText.replace(
            /(^|\})(([^,{]*)(,(?=[^}]*\{)|\s*\{))/g,
            function(match, g1, g2, g3) {
                // セレクタを分割してプレフィックスを追加
                const selectors = g3.split(',').map(selector => {
                    // bodyやhtmlなど特定のセレクタはスキップ
                    if (selector.trim() === 'body' || selector.trim() === 'html') {
                        return selector;
                    }
                    return prefix + ' ' + selector.trim();
                }).join(', ');
                
                return g1 + selectors + (g2.includes('{') ? ' {' : '');
            }
        );
    }
    
    /**
     * 状態メッセージを表示
     * 
     * @param {string} message - 表示するメッセージ
     * @param {string} type - メッセージタイプ (info, success, error)
     */
    showStatusMessage(message, type = 'info') {
        // 既存のメッセージを探す
        let statusDiv = document.querySelector('.import-status');
        
        // なければ作成
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.className = 'import-status';
            
            // メッセージコンテナに追加
            const filesArea = document.getElementById('files-area');
            if (filesArea) {
                const uploadArea = document.getElementById('upload-area');
                if (uploadArea) {
                    filesArea.insertBefore(statusDiv, uploadArea.nextSibling);
                } else {
                    filesArea.insertBefore(statusDiv, filesArea.firstChild);
                }
            } else {
                document.body.appendChild(statusDiv);
            }
        }
        
        // タイプに応じてクラスを変更
        statusDiv.className = `import-status ${type}`;
        
        // メッセージを設定
        statusDiv.innerHTML = `
            <span>${message}</span>
            <button class="close-btn">&times;</button>
        `;
        
        // 閉じるボタンのイベント設定
        const closeBtn = statusDiv.querySelector('.close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                statusDiv.remove();
            });
        }
        
        // エラー以外は5秒後に自動的に消える
        if (type !== 'error') {
            setTimeout(() => {
                if (statusDiv.parentNode) {
                    statusDiv.remove();
                }
            }, 5000);
        }
    }

    /**
     * ファイルの内容を読み込む
     * 
     * @param {File} file - 読み込むファイル
     * @return {Promise<string>} ファイルの内容
     */
    readFileContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            
            reader.onerror = (error) => {
                reject(error);
            };
            
            reader.readAsText(file);
        });
    }

    /**
     * ファイルの目次情報をサイドバーに追加
     * 
     * @param {string} fileId - ファイルID
     * @param {Object} analysis - 解析結果
     */
    addToSidebar(fileId, analysis) {
        // ダッシュボードのサイドバーにあるカテゴリーリスト
        const categoryList = this.dashboard.querySelector('#category-list');
        if (!categoryList) return;
        
        // ファイルのカテゴリを追加
        const categoryItem = document.createElement('li');
        categoryItem.innerHTML = `
            <span>
                <span class="category-color" style="background-color: #3498db;"></span>
                ${analysis.title}
            </span>
        `;
        
        // クリックイベントを設定
        categoryItem.addEventListener('click', () => {
            this.showFileToc(fileId);
        });
        
        categoryList.appendChild(categoryItem);
    }

    /**
     * ファイルの目次を表示
     * 
     * @param {string} fileId - 表示するファイルのID
     */
    showFileToc(fileId) {
        const fileInfo = this.fileStore[fileId];
        if (!fileInfo) return;
        
        // 既存の目次メニューを検索
        let tocMenu = document.getElementById('toc-menu');
        
        // 目次メニューがなければ作成
        if (!tocMenu) {
            const sidebarSections = document.querySelectorAll('.sidebar-section');
            const lastSection = sidebarSections[sidebarSections.length - 1];
            
            // 目次セクションを作成
            const tocSection = document.createElement('div');
            tocSection.className = 'sidebar-section';
            tocSection.innerHTML = `
                <h2 class="sidebar-title">目次</h2>
                <ul class="toc-menu" id="toc-menu"></ul>
            `;
            
            // サイドバーに追加
            if (lastSection) {
                lastSection.parentNode.insertBefore(tocSection, lastSection.nextSibling);
            } else {
                const sidebar = document.querySelector('.sidebar');
                if (sidebar) {
                    sidebar.appendChild(tocSection);
                }
            }
            
            tocMenu = document.getElementById('toc-menu');
        }
        
        // 目次メニューを更新
        if (tocMenu) {
            tocMenu.innerHTML = '';
            
            fileInfo.analysis.tocItems.forEach(item => {
                const li = document.createElement('li');
                li.setAttribute('data-file', fileInfo.name);
                li.setAttribute('data-slide', item.id);
                li.className = item.isActive ? 'active' : '';
                
                // アイコンがあれば表示
                const iconHtml = item.iconClass ? 
                    `<i class="${item.iconClass}"></i>` : 
                    '<i class="icon icon-topic"></i>';
                
                li.innerHTML = `${iconHtml}<span>${item.text}</span>`;
                
                // クリックイベントを設定
                li.addEventListener('click', () => {
                    this.showSlide(fileId, item.id);
                });
                
                tocMenu.appendChild(li);
            });
        }
        
        // サイトタイトルを更新
        const siteTitle = document.getElementById('site-title');
        if (siteTitle) {
            siteTitle.textContent = fileInfo.analysis.title;
        }
        
        // 最初のスライドを表示
        const firstSlide = fileInfo.analysis.slides.find(slide => slide.isActive) || 
                          fileInfo.analysis.slides[0];
        if (firstSlide) {
            this.showSlide(fileId, firstSlide.id);
        }
    }

    /**
     * スライドを表示
     * 
     * @param {string} fileId - ファイルID
     * @param {string} slideId - スライドID
     */
    showSlide(fileId, slideId) {
        const fileInfo = this.fileStore[fileId];
        if (!fileInfo) return;
        
        // 該当するスライドを見つける
        const slideInfo = fileInfo.analysis.slides.find(s => 
            s.id === slideId || 
            s.id === `slide-${slideId}` || 
            s.id === `slide${slideId}` ||
            s.tocId === slideId
        );
        
        if (!slideInfo) {
            console.warn(`スライドID "${slideId}" が見つかりません。`);
            return;
        }
        
        // プレビュータイトルとコンテンツを更新
        const previewTitle = document.getElementById('preview-title');
        const previewContent = document.getElementById('preview-content');
        
        if (previewTitle) {
            previewTitle.textContent = `「${slideInfo.title}」のプレビュー`;
        }
        
        if (previewContent) {
            // 一意のクラス名を生成（スタイル衝突回避用）
            const uniqueClass = `toc-content-${this.generateId()}`;
            
            // プレビュー用のコンテナを作成
            previewContent.innerHTML = `
                <div class="enhanced-preview">
                    <div class="preview-toc">
                        <h3>目次</h3>
                        <ul>
                            ${fileInfo.analysis.tocItems.map((item, index) => {
                                // アイコンHTMLを生成
                                const iconHtml = item.iconClass ? 
                                    `<i class="${item.iconClass}"></i> ` : 
                                    '';
                                
                                // インデントスタイルを生成（階層レベルがある場合）
                                const indentStyle = item.level ? 
                                    `style="margin-left: ${(item.level - 1) * 10}px;"` : 
                                    '';
                                
                                return `
                                    <li ${indentStyle}>
                                        <a href="#" class="${item.id === slideId ? 'active' : ''}" 
                                           data-slide="${item.id}" data-index="${index}">
                                            ${iconHtml}${item.text}
                                        </a>
                                    </li>
                                `;
                            }).join('')}
                        </ul>
                    </div>
                    <div class="preview-content-wrapper ${uniqueClass}">
                        ${slideInfo.content}
                    </div>
                </div>
            `;
            
            // 目次クリックイベントを設定
            const tocLinks = previewContent.querySelectorAll('.preview-toc a');
            tocLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const targetSlide = link.getAttribute('data-slide');
                    this.showSlide(fileId, targetSlide);
                    
                    // 目次メニューの選択状態を更新
                    const tocMenu = document.getElementById('toc-menu');
                    if (tocMenu) {
                        const items = tocMenu.querySelectorAll('li');
                        items.forEach(item => {
                            item.classList.remove('active');
                        });
                        
                        const activeItem = tocMenu.querySelector(`li[data-slide="${targetSlide}"]`);
                        if (activeItem) {
                            activeItem.classList.add('active');
                        }
                    }
                });
            });
            
            // スライド内の内部リンクを処理
            const contentLinks = previewContent.querySelectorAll('.preview-content-wrapper a[href^="#"]');
            contentLinks.forEach(link => {
                const href = link.getAttribute('href');
                if (href && href.startsWith('#')) {
                    // リンクを保持しつつクリックイベントを上書き
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        
                        // ターゲットIDを取得
                        const targetId = href.substring(1);
                        
                        // IDに対応するスライドを探す
                        const targetSlide = fileInfo.analysis.slides.find(s => 
                            s.id === targetId || 
                            s.id === `slide-${targetId}` || 
                            s.id === `slide${targetId}`
                        );
                        
                        if (targetSlide) {
                            // スライドへ移動
                            this.showSlide(fileId, targetSlide.id);
                        } else {
                            // 同じスライド内の要素へスクロール
                            const targetElement = previewContent.querySelector(`[id="${targetId}"]`);
                            if (targetElement) {
                                targetElement.scrollIntoView({ behavior: 'smooth' });
                            }
                        }
                    });
                }
            });
            
            // スクリプトの実行（制限付き）
            this.executeSlideScripts(previewContent, slideInfo.content);
        }
        
        // 編集ボタンを表示
        const editFileBtn = document.getElementById('edit-file-btn');
        if (editFileBtn) {
            editFileBtn.style.display = 'block';
            
            // クリックイベントを更新
            editFileBtn.onclick = () => {
                this.openEditModal(fileId, slideId);
            };
        }
    }
    
    /**
     * スライド内のスクリプトを安全に実行
     * 
     * @param {Element} container - スクリプトを実行するコンテナ要素
     * @param {string} content - スライドのHTML内容
     */
    executeSlideScripts(container, content) {
        try {
            // スクリプトを抽出（正規表現で単純化）
            const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
            const scripts = [];
            let match;
            
            while (match = scriptRegex.exec(content)) {
                const scriptContent = match[1];
                if (scriptContent && scriptContent.trim()) {
                    scripts.push(scriptContent);
                }
            }
            
            // 安全なスクリプトのみ実行（ナビゲーション機能など）
            if (scripts.length > 0) {
                scripts.forEach(script => {
                    // 危険な操作を含むスクリプトをフィルタリング
                    if (this.isSafeScript(script)) {
                        try {
                            // サンドボックス化された実行環境
                            const sandboxedScript = `
                                (function(container) {
                                    const document = {
                                        querySelector: selector => container.querySelector(selector),
                                        querySelectorAll: selector => container.querySelectorAll(selector),
                                        getElementById: id => container.querySelector('#' + id)
                                    };
                                    
                                    ${script}
                                })(arguments[0]);
                            `;
                            
                            // Function コンストラクタでスクリプトを実行
                            new Function('container', sandboxedScript)(container);
                        } catch (scriptError) {
                            console.warn('スクリプト実行エラー:', scriptError);
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('スクリプト処理エラー:', error);
        }
    }
    
    /**
     * スクリプトが安全かどうかを判定
     * 
     * @param {string} script - 判定するスクリプト
     * @return {boolean} 安全なスクリプトならtrue
     */
    isSafeScript(script) {
        // 危険な可能性のあるコード（例）
        const dangerousPatterns = [
            /eval\s*\(/i,                 // eval
            /Function\s*\(/i,             // Function constructor
            /document\.write/i,           // document.write
            /localStorage/i,              // localStorage
            /sessionStorage/i,            // sessionStorage
            /window\.open/i,              // window.open
            /location\s*=/i,              // location assignment
            /document\.cookie/i,          // document.cookie
            /XMLHttpRequest/i,            // XMLHttpRequest
            /fetch\s*\(/i,                // fetch API
            /navigator\./i,               // navigator object
            /parent\./i,                  // parent window
            /top\./i,                     // top window
            /\bself\b/i,                  // self reference
            /postMessage/i,               // postMessage
            /Worker\s*\(/i,               // Web Workers
            /WebSocket/i,                 // WebSockets
            /ServiceWorker/i,             // Service Workers
            /IndexedDB/i,                 // IndexedDB
            /document\.domain/i           // document.domain
        ];
        
        // 危険なパターンがあればfalseを返す
        return !dangerousPatterns.some(pattern => pattern.test(script));
    }

    /**
     * 編集モーダルを開く
     * 
     * @param {string} fileId - ファイルID
     * @param {string} slideId - スライドID
     */
    openEditModal(fileId, slideId) {
        const fileInfo = this.fileStore[fileId];
        if (!fileInfo) return;
        
        // スライド情報を取得
        const slideInfo = fileInfo.analysis.slides.find(s => 
            s.id === slideId || s.id === `slide-${slideId}` || s.id === `slide${slideId}`
        );
        
        if (!slideInfo) return;
        
        // ファイルモーダルのフィールドを更新
        const fileModal = document.getElementById('file-modal');
        if (!fileModal) return;
        
        const fileModalTitle = document.getElementById('file-modal-title');
        const fileName = document.getElementById('file-name');
        
        if (fileModalTitle) {
            fileModalTitle.textContent = `「${slideInfo.title}」の編集`;
        }
        
        if (fileName) {
            fileName.value = fileInfo.name;
        }
        
        // カテゴリの設定
        const fileCategory = document.getElementById('file-category');
        if (fileCategory) {
            fileCategory.value = ''; // デフォルトはカテゴリなし
        }
        
        // タグの設定
        const tagBadges = document.getElementById('tag-badges');
        const tagInput = document.getElementById('tag-input');
        
        if (tagBadges && tagInput) {
            tagBadges.innerHTML = '';
            
            // ファイルからタグを取得して追加
            ['HTML', 'スライド', fileInfo.analysis.title].forEach(tag => {
                const badge = document.createElement('div');
                badge.className = 'tag-badge';
                badge.innerHTML = `${tag}<button type="button">&times;</button>`;
                
                // 削除ボタンのイベント設定
                badge.querySelector('button').addEventListener('click', function() {
                    badge.remove();
                });
                
                tagBadges.appendChild(badge);
            });
            
            tagBadges.appendChild(tagInput);
        }
        
        // ファイル情報コンテナの更新
        const fileInfoContainer = document.getElementById('file-info-container');
        if (fileInfoContainer) {
            fileInfoContainer.innerHTML = this.generateFileInfoHtml(fileInfo, slideInfo);
        }
        
        // モーダルを表示
        fileModal.classList.add('active');
    }

    /**
     * ファイル情報HTML生成
     * 
     * @param {Object} fileInfo - ファイル情報
     * @param {Object} slideInfo - 表示中のスライド情報
     * @return {string} 生成されたHTML
     */
    generateFileInfoHtml(fileInfo, slideInfo) {
        return `
            <div class="file-info-section">
                <h3>ファイル情報</h3>
                <table class="info-table">
                    <tr>
                        <th>ファイル名</th>
                        <td>${fileInfo.name}</td>
                    </tr>
                    <tr>
                        <th>タイトル</th>
                        <td>${fileInfo.analysis.title}</td>
                    </tr>
                    <tr>
                        <th>スライド数</th>
                        <td>${fileInfo.analysis.slides.length}個</td>
                    </tr>
                    <tr>
                        <th>目次項目数</th>
                        <td>${fileInfo.analysis.tocItems.length}個</td>
                    </tr>
                    <tr>
                        <th>追加日時</th>
                        <td>${this.formatDate(fileInfo.dateAdded)}</td>
                    </tr>
                </table>
            </div>
            
            <div class="file-info-section">
                <h3>現在のスライド情報</h3>
                <table class="info-table">
                    <tr>
                        <th>スライドID</th>
                        <td>${slideInfo.id}</td>
                    </tr>
                    <tr>
                        <th>タイトル</th>
                        <td>${slideInfo.title}</td>
                    </tr>
                </table>
            </div>
        `;
    }

    /**
     * 一意のIDを生成
     * 
     * @return {string} 生成されたID
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }

    /**
     * 日付をフォーマット
     * 
     * @param {Date} date - フォーマットする日付
     * @return {string} フォーマットされた日付文字列
     */
    formatDate(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }
}

/**
 * ドラッグ＆ドロップ処理と初期化
 */
document.addEventListener('DOMContentLoaded', function() {
    // インテグレータのインスタンス化
    const integrator = new HTMLIntegrator(document);
    
    // ドラッグ＆ドロップエリア
    const uploadArea = document.getElementById('upload-area');
    if (!uploadArea) return;
    
    // ドラッグオーバー処理
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        this.classList.add('drag-over');
    });
    
    // ドラッグリーブ処理
    uploadArea.addEventListener('dragleave', function() {
        this.classList.remove('drag-over');
    });
    
    // ドロップ処理
    uploadArea.addEventListener('drop', async function(e) {
        e.preventDefault();
        this.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length === 0) return;
        
        // HTMLファイルのみ受け付ける
        const htmlFiles = Array.from(files).filter(file => 
            file.name.endsWith('.html') || file.name.endsWith('.htm')
        );
        
        if (htmlFiles.length === 0) {
            alert('HTMLファイルをドロップしてください。');
            return;
        }
        
        // 処理中表示
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'loading-overlay';
        loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
        document.body.appendChild(loadingOverlay);
        
        try {
            // ファイルを順番に処理
            for (const file of htmlFiles) {
                const result = await integrator.integrateFile(file);
                
                if (result.success) {
                    console.log(result.message);
                } else {
                    console.error(result.message);
                    alert(result.message);
                }
            }
        } catch (error) {
            console.error('ファイル処理エラー:', error);
            alert(`処理中にエラーが発生しました: ${error.message}`);
        } finally {
            // 処理中表示を削除
            document.body.removeChild(loadingOverlay);
        }
    });
    
    // ファイル選択ボタン
    const uploadBtn = uploadArea.querySelector('.upload-btn');
    const fileInput = document.getElementById('file-input');
    
    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', function() {
            fileInput.click();
        });
        
        fileInput.addEventListener('change', async function() {
            if (this.files.length === 0) return;
            
            // 処理中表示
            const loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            loadingOverlay.innerHTML = '<div class="loading-spinner"></div>';
            document.body.appendChild(loadingOverlay);
            
            try {
                // ファイルを順番に処理
                for (const file of this.files) {
                    const result = await integrator.integrateFile(file);
                    
                    if (result.success) {
                        console.log(result.message);
                    } else {
                        console.error(result.message);
                        alert(result.message);
                    }
                }
            } catch (error) {
                console.error('ファイル処理エラー:', error);
                alert(`処理中にエラーが発生しました: ${error.message}`);
            } finally {
                // 処理中表示を削除
                document.body.removeChild(loadingOverlay);
                // ファイル入力をリセット
                this.value = '';
            }
        });
    }
});