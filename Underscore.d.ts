/**
 * Underscore v1.8.3 for Google Apps Script
 */
declare namespace Underscore {
  /**
   * Returns the underscore.js library object.
   * 
   * Example:
   * var _ = Underscore.load();
   * 
   * @returns The root object of the underscore.js library (Underscore.js v1.8.3).
   */
  function load(): any;
}

// 戻り値の _ 自体に型を付けたい場合は、別途 @types/underscore をインストールし、
// function load(): _.UnderscoreStatic; と定義することをお勧めします。
