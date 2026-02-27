/**
 * Nested tag parsing, rendering, and matching.
 *
 * Tag syntax:
 *   "root"                          → simple tag
 *   "root [sub]"                    → root with one sub-tag
 *   "root [sub1] [sub2]"            → root with two sub-tags
 *   "root [sub [subsub]]"           → root with nested sub-sub-tag
 *
 * Matching: a demo tag matches a filter if the filter's parsed tree is a
 * "prefix" of the tag's tree.  E.g. filter "root" matches "root [sub]".
 */

export type TagNode = {
  text: string;
  children: TagNode[];
};

/** Parse a raw tag string into a tree. */
export function parseTag(raw: string): TagNode {
  let pos = 0;

  function parseNode(): TagNode {
    let text = "";
    const children: TagNode[] = [];

    // Read text until '[' or ']' or end
    while (pos < raw.length && raw[pos] !== "[" && raw[pos] !== "]") {
      text += raw[pos];
      pos++;
    }

    // Read children enclosed in [...]
    while (pos < raw.length && raw[pos] === "[") {
      pos++; // skip '['
      children.push(parseNode());
      if (pos < raw.length && raw[pos] === "]") pos++; // skip ']'
      // skip whitespace between ] and next [
      while (pos < raw.length && raw[pos] === " ") pos++;
    }

    return { text: text.trim(), children };
  }

  return parseNode();
}

/** Build a tag string from a path of ancestor texts. */
export function tagStringFromPath(path: string[]): string {
  let result = path[path.length - 1];
  for (let i = path.length - 2; i >= 0; i--) {
    result = path[i] + " [" + result + "]";
  }
  return result;
}

/** Does the tag tree contain the filter tree as a prefix? */
function treeMatches(tag: TagNode, filter: TagNode): boolean {
  if (tag.text !== filter.text) return false;
  // Every child in filter must have a matching child in tag
  return filter.children.every((filterChild) =>
    tag.children.some((tagChild) => treeMatches(tagChild, filterChild)),
  );
}

/** Does a raw demo tag string match a raw filter string? */
export function tagMatches(demoTag: string, filter: string): boolean {
  return treeMatches(parseTag(demoTag), parseTag(filter));
}
