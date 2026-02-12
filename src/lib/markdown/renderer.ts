import { marked } from "marked";
import type { Tokens, TokenizerAndRendererExtension } from "marked";
import type { RendererOptions } from "./types";
import { cssPropertiesToString, isLightCodeTheme } from "./styles";
import { highlightCode } from "./code-highlight";
import katex from "katex";

// 自定义 LaTeX 块的 Token 类型
interface LatexBlockToken extends Tokens.Generic {
  type: "latexBlock";
  raw: string;
  text: string;
}

// 自定义 Mermaid 块的 Token 类型
interface MermaidBlockToken extends Tokens.Generic {
  type: "mermaidBlock";
  raw: string;
  text: string;
}

export class MarkdownRenderer {
  private renderer: typeof marked.Renderer.prototype;
  private options: RendererOptions;

  constructor(options: RendererOptions) {
    this.options = options;
    this.renderer = new marked.Renderer();
    this.initializeRenderer();
    this.initializeLatexExtension();
    this.initializeMermaidExtension();
  }

  private initializeLatexExtension() {
    // 添加 LaTeX 块的 tokenizer
    const latexBlockTokenizer: TokenizerAndRendererExtension = {
      name: "latexBlock",
      level: "block",
      start(src: string) {
        return src.match(/^\$\$/)?.index;
      },
      tokenizer(src: string) {
        const rule = /^\$\$([\s\S]*?)\$\$/;
        const match = rule.exec(src);
        if (match) {
          const content = match[1].trim();
          return {
            type: "latexBlock",
            raw: match[0],
            tokens: [],
            text: content,
          };
        }
      },
      renderer: (token) => {
        try {
          const latexStyle = this.options.block?.latex || {};
          const style = {
            ...latexStyle,
            display: "block",
            margin: "1em 0",
            textAlign: "center" as const,
          };
          const styleStr = cssPropertiesToString(style);
          const rendered = katex.renderToString(token.text, {
            displayMode: true,
            throwOnError: false,
          });
          return `<div${
            styleStr ? ` style="${styleStr}"` : ""
          }>${rendered}</div>`;
        } catch (error) {
          console.error("LaTeX rendering error:", error);
          return token.raw;
        }
      },
    };

    // 注册扩展
    marked.use({ extensions: [latexBlockTokenizer] });
  }

  private initializeMermaidExtension() {
    // 添加 Mermaid 块的 tokenizer
    const mermaidBlockTokenizer: TokenizerAndRendererExtension = {
      name: "mermaidBlock",
      level: "block",
      start(src: string) {
        // 支持两种格式：```mermaid 和 ``` 后面跟 mermaid 内容
        return src.match(
          /^```(?:mermaid\s*$|[\s\n]*pie\s+|[\s\n]*graph\s+|[\s\n]*sequenceDiagram\s+|[\s\n]*gantt\s+|[\s\n]*classDiagram\s+|[\s\n]*flowchart\s+)/,
        )?.index;
      },
      tokenizer(src: string) {
        // 匹配两种格式
        const rule = /^```(?:mermaid\s*\n)?([\s\S]*?)\n*```(?:\s*\n|$)/;
        const match = rule.exec(src);
        if (match) {
          const content = match[1].trim();
          // 检查内容是否是 mermaid 图表
          if (
            content.match(
              /^(?:pie\s+|graph\s+|sequenceDiagram\s+|gantt\s+|classDiagram\s+|flowchart\s+)/,
            )
          ) {
            // 如果是饼图，添加 showData 选项
            const processedContent = content.startsWith("pie")
              ? `pie showData\n${content.replace(/^pie\s*/, "").trim()}`
              : content;
            return {
              type: "mermaidBlock",
              raw: match[0],
              tokens: [],
              text: processedContent,
            };
          }
        }
      },
      renderer: (token) => {
        try {
          const mermaidStyle = this.options.block?.mermaid || {};
          const style = {
            ...mermaidStyle,
            display: "block",
            margin: "1em 0",
            textAlign: "center" as const,
            background: "transparent",
          };
          const styleStr = cssPropertiesToString(style);

          // Remove the random ID generation since it's not needed
          // Return a simple div with the mermaid class and content
          return `<div${
            styleStr ? ` style="${styleStr}"` : ""
          } class="mermaid">${token.text}</div>`;
        } catch (error) {
          console.error("Mermaid rendering error:", error);
          return `<pre><code class="language-mermaid">${token.text}</code></pre>`;
        }
      },
    };

    // 注册扩展
    marked.use({ extensions: [mermaidBlockTokenizer] });
  }

  private initializeRenderer() {
    // 重写 text 方法来处理行内 LaTeX 公式
    this.renderer.text = (token: Tokens.Text | Tokens.Escape) => {
      // 只处理行内公式
      return token.text.replace(/(?<!\$)\$([^\n$]+?)\$/g, (match, inline) => {
        try {
          return katex.renderToString(inline.trim(), {
            displayMode: false,
            throwOnError: false,
          });
        } catch (error) {
          console.error("LaTeX inline rendering error:", error);
          return match;
        }
      });
    };

    // 重写 heading 方法
    this.renderer.heading = ({ text, depth }: Tokens.Heading) => {
      const headingKey = `h${depth}` as keyof RendererOptions["block"];
      const headingStyle = this.options.block?.[headingKey] || {};
      const style = {
        ...headingStyle,
        color: this.options.base?.themeColor,
      };
      const styleStr = cssPropertiesToString(style);
      const tokens = marked.Lexer.lexInline(text);
      const content = marked.Parser.parseInline(tokens, {
        renderer: this.renderer,
      });
      return `<h${depth}${
        styleStr ? ` style="${styleStr}"` : ""
      }>${content}</h${depth}>`;
    };

    // 重写 paragraph 方法
    this.renderer.paragraph = ({ text, tokens }: Tokens.Paragraph) => {
      const paragraphStyle = this.options.block?.p || {};
      const style = {
        ...paragraphStyle,
        fontSize: this.options.base?.fontSize,
        lineHeight: this.options.base?.lineHeight,
      };
      const styleStr = cssPropertiesToString(style);

      // 处理段落中的内联标记
      let content = text;
      if (tokens) {
        content = tokens
          .map((token) => {
            if (token.type === "text") {
              const inlineTokens = marked.Lexer.lexInline(token.text);
              return marked.Parser.parseInline(inlineTokens, {
                renderer: this.renderer,
              });
            }
            return marked.Parser.parseInline([token], {
              renderer: this.renderer,
            });
          })
          .join("");
      } else {
        const inlineTokens = marked.Lexer.lexInline(text);
        content = marked.Parser.parseInline(inlineTokens, {
          renderer: this.renderer,
        });
      }

      return `<p${styleStr ? ` style="${styleStr}"` : ""}>${content}</p>`;
    };

    // 重写 blockquote 方法
    this.renderer.blockquote = ({ text }: Tokens.Blockquote) => {
      const blockquoteStyle = this.options.block?.blockquote || {};
      const style = {
        ...blockquoteStyle,
        borderLeft: `4px solid ${this.options.base?.themeColor || "#1a1a1a"}`,
      };
      const styleStr = cssPropertiesToString(style);
      const tokens = marked.Lexer.lexInline(text);
      const content = marked.Parser.parseInline(tokens, {
        renderer: this.renderer,
      });

      return `<blockquote${
        styleStr ? ` style="${styleStr}"` : ""
      }>${content}</blockquote>`;
    };

    // 重写 code 方法
    this.renderer.code = ({ text, lang }: Tokens.Code) => {
      const codeTheme = this.options.codeTheme || "github";
      const forceDarkPalette = isLightCodeTheme(codeTheme);
      const highlighted = highlightCode(text, lang || "", codeTheme, {
        forceDarkPalette,
      });
      const langLabel = lang ? lang.toUpperCase() : "CODE";
      const codePreOptions = this.options.block?.code_pre || {};

      const {
        margin,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
        background: _background,
        backgroundColor: _backgroundColor,
        border: _border,
        borderRadius: _borderRadius,
        boxShadow,
        fontFamily,
        color: codePreColor,
        ...preStyleOptions
      } = codePreOptions;

      const containerStyleObj = {
        borderRadius: "10px",
        overflow: "hidden",
        background: "linear-gradient(145deg, #1e1e1e, #2d2d2d)",
        boxShadow:
          boxShadow ||
          "0 6px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05)",
        fontFamily: fontFamily || "Menlo, Monaco, Consolas, monospace",
        margin,
        marginTop,
        marginRight,
        marginBottom,
        marginLeft,
      };

      if (
        !containerStyleObj.margin &&
        !containerStyleObj.marginTop &&
        !containerStyleObj.marginRight &&
        !containerStyleObj.marginBottom &&
        !containerStyleObj.marginLeft
      ) {
        containerStyleObj.margin = "1em 0";
      }

      const preStyleObj = {
        margin: "0",
        padding: "16px 20px",
        overflowX: "auto",
        fontFamily: fontFamily || "Menlo, Monaco, Consolas, monospace",
        fontSize: "13px",
        lineHeight: "1.6",
        ...preStyleOptions,
        background: "transparent",
        borderRadius: "0",
        border: "none",
      };

      const codeStyleOptions = this.options.block?.code || {};
      const codeStyleObj = {
        fontFamily: fontFamily || "Menlo, Monaco, Consolas, monospace",
        fontSize: codeStyleOptions.fontSize || preStyleObj.fontSize || "13px",
        lineHeight:
          codeStyleOptions.lineHeight || preStyleObj.lineHeight || "1.6",
        color:
          codeStyleOptions.color ||
          (!forceDarkPalette ? codePreColor : undefined) ||
          (forceDarkPalette ? "#f8f8f2" : "#e0e0e0"),
        ...codeStyleOptions,
      };

      const containerStyle = cssPropertiesToString(containerStyleObj);
      const preStyle = cssPropertiesToString(preStyleObj);
      const codeStyle = cssPropertiesToString(codeStyleObj);

      const headerStyle = [
        "display: flex",
        "align-items: center",
        "justify-content: space-between",
        "padding: 12px 16px",
        "background: linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 100%)",
        "border-bottom: 1px solid rgba(0,0,0,0.3)",
        `font-family: ${fontFamily || "Menlo, Monaco, Consolas, monospace"}`,
      ].join("; ");

      const controlsStyle = "display: flex; gap: 8px;";
      const btnBaseStyle =
        "width: 12px; height: 12px; border-radius: 50%; display: inline-block;";

      const closeBtnStyle = `${btnBaseStyle} background: linear-gradient(135deg, #ff605c 0%, #d94a46 100%);`;
      const minBtnStyle = `${btnBaseStyle} background: linear-gradient(135deg, #ffbd44 0%, #d9a038 100%);`;
      const maxBtnStyle = `${btnBaseStyle} background: linear-gradient(135deg, #00ca4e 0%, #00a63e 100%);`;

      const langStyle =
        "font-size: 12px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px;";

      return `<section style="${containerStyle}"><section style="${headerStyle}"><section style="${controlsStyle}"><span style="${closeBtnStyle}"></span><span style="${minBtnStyle}"></span><span style="${maxBtnStyle}"></span></section><span style="${langStyle}">${langLabel}</span></section><pre style="${preStyle}"><code style="${codeStyle}">${highlighted}</code></pre></section>`;
    };

    // 重写 codespan 方法
    this.renderer.codespan = ({ text }: Tokens.Codespan) => {
      const codespanStyle = this.options.inline?.codespan || {};
      const styleStr = cssPropertiesToString(codespanStyle);
      return `<code class="inline-code"${
        styleStr ? ` style="${styleStr}"` : ""
      }>${text}</code>`;
    };

    // 重写 em 方法
    this.renderer.em = ({ text }: Tokens.Em) => {
      const emStyle = this.options.inline?.em || {};
      const style = {
        ...emStyle,
        fontStyle: "italic",
      };
      const styleStr = cssPropertiesToString(style);
      const tokens = marked.Lexer.lexInline(text);
      const content = marked.Parser.parseInline(tokens, {
        renderer: this.renderer,
      });

      return `<em${styleStr ? ` style="${styleStr}"` : ""}>${content}</em>`;
    };

    // 重写 strong 方法
    this.renderer.strong = ({ text }: Tokens.Strong) => {
      const strongStyle = this.options.inline?.strong || {};
      const style = {
        ...strongStyle,
        color: this.options.base?.themeColor,
        fontWeight: "bold",
      };
      const styleStr = cssPropertiesToString(style);
      const tokens = marked.Lexer.lexInline(text);
      const content = marked.Parser.parseInline(tokens, {
        renderer: this.renderer,
      });

      return `<strong${
        styleStr ? ` style="${styleStr}"` : ""
      }>${content}</strong>`;
    };

    // 重写 link 方法
    this.renderer.link = ({ href, title, text }: Tokens.Link) => {
      const linkStyle = this.options.inline?.link || {};
      const styleStr = cssPropertiesToString(linkStyle);
      return `<a href="${href}"${title ? ` title="${title}"` : ""}${
        styleStr ? ` style="${styleStr}"` : ""
      }>${text}</a>`;
    };

    // 重写 image 方法
    this.renderer.image = ({ href, title, text }: Tokens.Image) => {
      const imageStyle = this.options.block?.image || {};
      const style = {
        ...imageStyle,
        maxWidth: "100%",
        display: "block",
        margin: "0.5em auto",
      };
      const styleStr = cssPropertiesToString(style);
      return `<img src="${href}"${
        title ? ` title="${title}"` : ""
      } alt="${text}"${styleStr ? ` style="${styleStr}"` : ""}>`;
    };

    // 重写 list 方法
    this.renderer.list = (token: Tokens.List) => {
      const tag = token.ordered ? "ol" : "ul";
      const listStyle = this.options.block?.[tag] || {};
      const style = {
        ...listStyle,
        listStyle: token.ordered ? "decimal" : "disc",
        paddingLeft: "2em",
        marginBottom: "16px",
      };
      const styleStr = cssPropertiesToString(style);
      const startAttr =
        token.ordered && token.start !== 1 ? ` start="${token.start}"` : "";

      const items = token.items
        .map((item) => {
          let itemText = item.text;
          if (item.task) {
            const checkbox = `<input type="checkbox"${
              item.checked ? ' checked=""' : ""
            } disabled="" /> `;
            itemText = checkbox + itemText;
          }
          return this.renderer.listitem({ ...item, text: itemText });
        })
        .join("");

      return `<${tag}${startAttr}${
        styleStr ? ` style="${styleStr}"` : ""
      }>${items}</${tag}>`;
    };

    // 重写 listitem 方法
    this.renderer.listitem = (item: Tokens.ListItem) => {
      const listitemStyle = this.options.inline?.listitem || {};
      const style = {
        ...listitemStyle,
        marginBottom: "8px",
        display: "list-item",
      };
      const styleStr = cssPropertiesToString(style);

      // 处理嵌套列表和内容
      let content = item.text;
      if (item.tokens) {
        content = item.tokens
          .map((token) => {
            if (token.type === "list") {
              // 递归处理嵌套列表
              return this.renderer.list(token as Tokens.List);
            } else if (token.type === "text" || token.type === "paragraph") {
              // 处理文本节点和段落节点
              // 首先处理块级公式
              const processedText = (token.text || token.raw).replace(
                /\$\$([\s\S]+?)\$\$/g,
                (match: string, formula: string) => {
                  try {
                    const latexStyle = this.options.block?.latex || {};
                    const style = {
                      ...latexStyle,
                      display: "block",
                      margin: "1em 0",
                      textAlign: "center" as const,
                    };
                    const styleStr = cssPropertiesToString(style);
                    const rendered = katex.renderToString(formula.trim(), {
                      displayMode: true,
                      throwOnError: false,
                    });
                    return `<div${
                      styleStr ? ` style="${styleStr}"` : ""
                    }>${rendered}</div>`;
                  } catch (error) {
                    console.error("LaTeX block rendering error:", error);
                    return match;
                  }
                },
              );

              // 然后处理其他内联标记
              const inlineTokens = marked.Lexer.lexInline(processedText);
              return marked.Parser.parseInline(inlineTokens, {
                renderer: this.renderer,
              });
            } else {
              // 对于其他类型的 token，直接使用其原始内容
              return token.raw;
            }
          })
          .join("");
      } else {
        // 如果没有 tokens，则按普通文本处理
        const inlineTokens = marked.Lexer.lexInline(content);
        content = marked.Parser.parseInline(inlineTokens, {
          renderer: this.renderer,
        });
      }

      // 处理任务列表项
      if (item.task) {
        const checkbox = `<input type="checkbox"${
          item.checked ? ' checked=""' : ""
        } disabled="" /> `;
        content = checkbox + content;
      }

      return `<li${styleStr ? ` style="${styleStr}"` : ""}>${content}</li>`;
    };

    // 添加删除线支持
    this.renderer.del = ({ text }: Tokens.Del) => {
      const styleOptions = this.options.inline?.del || {};
      const styleStr = cssPropertiesToString(styleOptions);
      return `<del${styleStr ? ` style="${styleStr}"` : ""}>${text}</del>`;
    };

    // 添加表格渲染支持 - 微信公众号兼容版本
    this.renderer.table = ({ header, rows }: Tokens.Table) => {
      // 获取主题色,提供默认值
      const themeColor = this.options.base?.themeColor || "#00b38a";

      // 表格样式 - 简洁的边框样式(微信兼容)
      const tableStyles = [
        "width:100%",
        "margin-bottom:1em",
        "border-collapse:separate",
        "border-spacing:0",
        "font-size:14px",
        "text-align:center",
        "margin:1em 8px",
        "border:1px solid #e0e0e0", // 简单的边框
      ].join(";");

      const theadStyles = ["font-weight:bold"].join(";");

      // 表头单元格样式 - 背景色在th上
      const thStyles = [
        "padding:12px 16px",
        "border:none",
        `background-color:${themeColor}`,
        "color:#ffffff",
        "font-weight:bold",
        "font-size:14px",
        "text-align:center",
        "word-wrap:break-word", // 长单词换行
        "overflow-wrap:break-word", // 兼容性更好
      ].join(";");

      // 渲染表头
      const headerCells = header
        .map((cell) => {
          const tokens = marked.Lexer.lexInline(cell.text);
          const content = marked.Parser.parseInline(tokens, {
            renderer: this.renderer,
          });

          // 直接使用thStyles,不添加圆角
          return `<th style="${thStyles}" bgcolor="${themeColor}" align="center">${content}</th>`;
        })
        .join("");

      // 渲染表体行
      const bodyRows = rows
        .map((row, rowIndex) => {
          // 斑马纹 - 使用固定十六进制颜色
          const isEven = rowIndex % 2 === 1;
          const rowBgColor = isEven ? "#f7f7f7" : "#ffffff";
          const trStyles = "";
          const isLastRow = rowIndex === rows.length - 1;

          const cells = row
            .map((cell, cellIndex) => {
              // 单元格样式 - 固定颜色
              const tdStyles = [
                `background-color:${rowBgColor}`,
                "border:none",
                "padding:12px 16px",
                isLastRow ? "" : "border-bottom:1px solid #e0e0e0",
                "color:#333333",
                "text-align:center",
                "word-wrap:break-word", // 长单词换行
                "overflow-wrap:break-word", // 兼容性更好
              ]
                .filter((s) => s)
                .join(";");

              // 直接使用tdStyles,不添加圆角
              const tokens = marked.Lexer.lexInline(cell.text);
              const content = marked.Parser.parseInline(tokens, {
                renderer: this.renderer,
              });
              return `<td style="${tdStyles}" bgcolor="${rowBgColor}" align="center">${content}</td>`;
            })
            .join("");

          return `<tr${trStyles ? ` style="${trStyles}"` : ""}>${cells}</tr>`;
        })
        .join("");

      return `<table style="${tableStyles}">
        <thead style="${theadStyles}">
          <tr>${headerCells}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>`;
    };
  }

  public getRenderer(): typeof marked.Renderer.prototype {
    return this.renderer;
  }
}
