import SourceSans3Italic from "./SourceSans3-Italic.ttf";
import SourceSans3 from "./SourceSans3.ttf";

// Source Sans 3 (formerly Source Sans Pro), as variable fonts covering every
// weight
const style = document.createElement("style");
style.textContent = `
@font-face {
  font-family: 'Source Sans 3';
  src: url('${SourceSans3}') format('truetype');
  font-weight: 200 900;
  font-style: normal;
}
@font-face {
  font-family: 'Source Sans 3';
  src: url('${SourceSans3Italic}') format('truetype');
  font-weight: 200 900;
  font-style: italic;
}`;
document.head.appendChild(style);

export const sourceSans = "'Source Sans 3', 'Source Sans Pro', sans-serif";
