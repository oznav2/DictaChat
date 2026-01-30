import "./chunk-QRCWDNKT.js";
import {
  add_locations,
  append_styles,
  bind_element_size,
  bind_this,
  check_target,
  cleanup_styles,
  each,
  hmr,
  if_block,
  legacy_api,
  prop,
  set_style,
  snippet,
  validate_each_keys
} from "./chunk-PLKPVGU2.js";
import {
  append,
  comment,
  from_html
} from "./chunk-DJ6FSLDI.js";
import {
  FILENAME,
  HMR,
  child,
  first_child,
  get,
  pop,
  proxy,
  push,
  reset,
  set,
  sibling,
  snapshot,
  state,
  strict_equals,
  template_effect,
  untrack,
  user_derived,
  user_effect
} from "./chunk-EGNO7VLM.js";
import "./chunk-FT2Y2KWB.js";
import "./chunk-2GRV7DLA.js";
import "./chunk-OKMPZSYG.js";
import "./chunk-KDVGFZWC.js";
import "./chunk-6LNZPZHA.js";

// node_modules/svelte-tiny-virtual-list/dist/constants.js
var ALIGNMENT = (
  /** @type {const} */
  {
    AUTO: "auto",
    START: "start",
    CENTER: "center",
    END: "end"
  }
);
var DIRECTION = (
  /** @type {const} */
  {
    HORIZONTAL: "horizontal",
    VERTICAL: "vertical"
  }
);
var SCROLL_CHANGE_REASON = {
  OBSERVED: 0,
  REQUESTED: 1
};
var SCROLL_PROP = (
  /** @type {const} */
  {
    [DIRECTION.VERTICAL]: "top",
    [DIRECTION.HORIZONTAL]: "left"
  }
);
var SCROLL_PROP_LEGACY = (
  /** @type {const} */
  {
    [DIRECTION.VERTICAL]: "scrollTop",
    [DIRECTION.HORIZONTAL]: "scrollLeft"
  }
);

// node_modules/svelte-tiny-virtual-list/dist/SizeAndPositionManager.js
var SizeAndPositionManager = class {
  /**
   * @param {ItemSize} itemSize
   * @param {number} itemCount
   * @param {number} estimatedItemSize
   */
  constructor(itemSize, itemCount, estimatedItemSize) {
    this.itemSize = itemSize;
    this.itemCount = itemCount;
    this.estimatedItemSize = estimatedItemSize;
    this.itemSizeAndPositionData = {};
    this.lastMeasuredIndex = -1;
    this.checkForMismatchItemSizeAndItemCount();
    if (!this.justInTime) this.computeTotalSizeAndPositionData();
  }
  get justInTime() {
    return typeof this.itemSize === "function";
  }
  /**
   * @param {ItemSize} itemSize
   * @param {number} itemCount
   * @param {number} estimatedItemSize
   */
  updateConfig(itemSize, itemCount, estimatedItemSize) {
    this.itemSize = itemSize;
    this.itemCount = itemCount;
    this.estimatedItemSize = estimatedItemSize;
    this.checkForMismatchItemSizeAndItemCount();
    if (this.justInTime && this.totalSize != null) {
      this.totalSize = void 0;
    } else {
      this.computeTotalSizeAndPositionData();
    }
  }
  checkForMismatchItemSizeAndItemCount() {
    if (Array.isArray(this.itemSize) && this.itemSize.length < this.itemCount) {
      throw Error(`When itemSize is an array, itemSize.length can't be smaller than itemCount`);
    }
  }
  /**
   * @param {number} index
   */
  getSize(index) {
    const { itemSize } = this;
    if (typeof itemSize === "function") {
      return itemSize(index);
    }
    return Array.isArray(itemSize) ? itemSize[index] : itemSize;
  }
  /**
   * Compute the totalSize and itemSizeAndPositionData at the start,
   * only when itemSize is a number or an array.
   */
  computeTotalSizeAndPositionData() {
    let totalSize = 0;
    for (let i = 0; i < this.itemCount; i++) {
      const size = this.getSize(i);
      const offset = totalSize;
      totalSize += size;
      this.itemSizeAndPositionData[i] = {
        offset,
        size
      };
    }
    this.totalSize = totalSize;
  }
  getLastMeasuredIndex() {
    return this.lastMeasuredIndex;
  }
  /**
   * This method returns the size and position for the item at the specified index.
   *
   * @param {number} index
   */
  getSizeAndPositionForIndex(index) {
    if (index < 0 || index >= this.itemCount) {
      throw Error(`Requested index ${index} is outside of range 0..${this.itemCount}`);
    }
    return this.justInTime ? this.getJustInTimeSizeAndPositionForIndex(index) : this.itemSizeAndPositionData[index];
  }
  /**
   * This is used when itemSize is a function.
   * just-in-time calculates (or used cached values) for items leading up to the index.
   *
   * @param {number} index
   */
  getJustInTimeSizeAndPositionForIndex(index) {
    if (index > this.lastMeasuredIndex) {
      const lastMeasuredSizeAndPosition = this.getSizeAndPositionOfLastMeasuredItem();
      let offset = lastMeasuredSizeAndPosition.offset + lastMeasuredSizeAndPosition.size;
      for (let i = this.lastMeasuredIndex + 1; i <= index; i++) {
        const size = this.getSize(i);
        if (size == null || Number.isNaN(size)) {
          throw Error(`Invalid size returned for index ${i} of value ${size}`);
        }
        this.itemSizeAndPositionData[i] = {
          offset,
          size
        };
        offset += size;
      }
      this.lastMeasuredIndex = index;
    }
    return this.itemSizeAndPositionData[index];
  }
  getSizeAndPositionOfLastMeasuredItem() {
    return this.lastMeasuredIndex >= 0 ? this.itemSizeAndPositionData[this.lastMeasuredIndex] : { offset: 0, size: 0 };
  }
  /**
   * Total size of all items being measured.
   *
   * @return {number}
   */
  getTotalSize() {
    if (this.totalSize) return this.totalSize;
    const lastMeasuredSizeAndPosition = this.getSizeAndPositionOfLastMeasuredItem();
    return lastMeasuredSizeAndPosition.offset + lastMeasuredSizeAndPosition.size + (this.itemCount - this.lastMeasuredIndex - 1) * this.estimatedItemSize;
  }
  /**
   * Determines a new offset that ensures a certain item is visible, given the alignment.
   *
   * @param {'auto' | 'start' | 'center' | 'end'} align Desired alignment within container
   * @param {number | undefined} containerSize Size (width or height) of the container viewport
   * @param {number | undefined} currentOffset
   * @param {number | undefined} targetIndex
   * @return {number} Offset to use to ensure the specified item is visible
   */
  getUpdatedOffsetForIndex(align, containerSize, currentOffset, targetIndex) {
    if (containerSize <= 0) {
      return 0;
    }
    const datum = this.getSizeAndPositionForIndex(targetIndex);
    const maxOffset = datum.offset;
    const minOffset = maxOffset - containerSize + datum.size;
    let idealOffset;
    switch (align) {
      case ALIGNMENT.END:
        idealOffset = minOffset;
        break;
      case ALIGNMENT.CENTER:
        idealOffset = maxOffset - (containerSize - datum.size) / 2;
        break;
      case ALIGNMENT.START:
        idealOffset = maxOffset;
        break;
      default:
        idealOffset = Math.max(minOffset, Math.min(maxOffset, currentOffset));
    }
    const totalSize = this.getTotalSize();
    return Math.max(0, Math.min(totalSize - containerSize, idealOffset));
  }
  /**
   * @param {number} containerSize
   * @param {number} offset
   * @param {number} overscanCount
   * @return {{start: number|undefined, end: number|undefined}}
   */
  getVisibleRange(containerSize, offset, overscanCount) {
    const totalSize = this.getTotalSize();
    if (totalSize === 0) {
      return {};
    }
    const maxOffset = offset + containerSize;
    let start = this.findNearestItem(offset);
    if (start === void 0) {
      throw Error(`Invalid offset ${offset} specified`);
    }
    const datum = this.getSizeAndPositionForIndex(start);
    offset = datum.offset + datum.size;
    let end = start;
    while (offset < maxOffset && end < this.itemCount - 1) {
      end++;
      offset += this.getSizeAndPositionForIndex(end).size;
    }
    if (overscanCount) {
      start = Math.max(0, start - overscanCount);
      end = Math.min(end + overscanCount, this.itemCount - 1);
    }
    return {
      start,
      end
    };
  }
  /**
   * Clear all cached values for items after the specified index.
   * This method should be called for any item that has changed its size.
   * It will not immediately perform any calculations; they'll be performed the next time getSizeAndPositionForIndex() is called.
   *
   * @param {number} index
   */
  resetItem(index) {
    this.lastMeasuredIndex = Math.min(this.lastMeasuredIndex, index - 1);
  }
  /**
   * Searches for the item (index) nearest the specified offset.
   *
   * If no exact match is found the next lowest item index will be returned.
   * This allows partially visible items (with offsets just before/above the fold) to be visible.
   *
   * @param {number} offset
   */
  findNearestItem(offset) {
    if (Number.isNaN(offset)) {
      throw Error(`Invalid offset ${offset} specified`);
    }
    offset = Math.max(0, offset);
    const lastMeasuredSizeAndPosition = this.getSizeAndPositionOfLastMeasuredItem();
    const lastMeasuredIndex = Math.max(0, this.lastMeasuredIndex);
    if (lastMeasuredSizeAndPosition.offset >= offset) {
      return this.binarySearch(lastMeasuredIndex, 0, offset);
    } else {
      return this.exponentialSearch(lastMeasuredIndex, offset);
    }
  }
  /**
   * @private
   * @param {number} high
   * @param {number} low
   * @param {number} offset
   */
  binarySearch(high, low, offset) {
    let middle = 0;
    let currentOffset = 0;
    while (low <= high) {
      middle = low + Math.floor((high - low) / 2);
      currentOffset = this.getSizeAndPositionForIndex(middle).offset;
      if (currentOffset === offset) {
        return middle;
      } else if (currentOffset < offset) {
        low = middle + 1;
      } else if (currentOffset > offset) {
        high = middle - 1;
      }
    }
    if (low > 0) {
      return low - 1;
    }
    return 0;
  }
  /**
   * @private
   * @param {number} index
   * @param {number} offset
   */
  exponentialSearch(index, offset) {
    let interval = 1;
    while (index < this.itemCount && this.getSizeAndPositionForIndex(index).offset < offset) {
      index += interval;
      interval *= 2;
    }
    return this.binarySearch(Math.min(index, this.itemCount - 1), Math.floor(index / 2), offset);
  }
};

// node_modules/svelte-tiny-virtual-list/dist/VirtualList.svelte
VirtualList[FILENAME] = "node_modules/svelte-tiny-virtual-list/dist/VirtualList.svelte";
var root = add_locations(from_html(`<div class="virtual-list-wrapper s-LBoz29dSa-wv"><!> <div class="virtual-list-inner s-LBoz29dSa-wv"></div> <!></div>`), VirtualList[FILENAME], [[330, 0, [[341, 1]]]]);
var $$css = {
  hash: "s-LBoz29dSa-wv",
  code: "\n	.virtual-list-wrapper.s-LBoz29dSa-wv {\n		overflow: auto;\n		will-change: transform;\n		-webkit-overflow-scrolling: touch;\n	}\n\n	.virtual-list-inner.s-LBoz29dSa-wv {\n		position: relative;\n		display: flex;\n		width: 100%;\n	}\n\n/*# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiVmlydHVhbExpc3Quc3ZlbHRlIiwibWFwcGluZ3MiOiIiLCJuYW1lcyI6W10sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIlZpcnR1YWxMaXN0LnN2ZWx0ZSJdfQ== */"
};
function VirtualList($$anchor, $$props) {
  check_target(new.target);
  push($$props, true, VirtualList);
  append_styles($$anchor, $$css);
  let height = prop($$props, "height", 3, "100%"), width = prop($$props, "width", 3, "100%"), stickyIndices = prop($$props, "stickyIndices", 19, () => []), scrollDirection = prop($$props, "scrollDirection", 19, () => DIRECTION.VERTICAL), scrollToAlignment = prop($$props, "scrollToAlignment", 19, () => ALIGNMENT.START), scrollToBehaviour = prop($$props, "scrollToBehaviour", 3, "instant"), overscanCount = prop($$props, "overscanCount", 3, 3);
  let estimatedItemSize = user_derived(() => $$props.estimatedItemSize || strict_equals(typeof $$props.itemSize, "number") && $$props.itemSize || 50);
  const sizeAndPositionManager = new SizeAndPositionManager($$props.itemSize, $$props.itemCount, get(estimatedItemSize));
  let wrapper;
  let wrapperHeight = state(400);
  let wrapperWidth = state(400);
  let items = state([]);
  let scroll = state({
    offset: $$props.scrollOffset || strict_equals($$props.scrollToIndex, void 0, false) && getOffsetForIndex($$props.scrollToIndex) || 0,
    changeReason: SCROLL_CHANGE_REASON.REQUESTED
  });
  let prevScroll = snapshot(get(scroll));
  let heightNumber = user_derived(() => Number.isFinite(height()) ? Number(height()) : get(wrapperHeight));
  let widthNumber = user_derived(() => Number.isFinite(width()) ? Number(width()) : get(wrapperWidth));
  let prevProps = {
    scrollToIndex: snapshot($$props.scrollToIndex),
    scrollToAlignment: snapshot(scrollToAlignment()),
    scrollOffset: snapshot($$props.scrollOffset),
    itemCount: snapshot($$props.itemCount),
    itemSize: strict_equals(typeof $$props.itemSize, "function") ? $$props.itemSize : snapshot($$props.itemSize),
    estimatedItemSize: snapshot(get(estimatedItemSize)),
    heightNumber: snapshot(get(heightNumber)),
    widthNumber: snapshot(get(widthNumber)),
    stickyIndices: snapshot(stickyIndices())
  };
  let styleCache = state(proxy({}));
  let wrapperStyle = state("");
  let innerStyle = state("");
  user_effect(() => {
    let frame;
    const handleScrollAsync = (event) => {
      if (strict_equals(frame, void 0, false)) {
        cancelAnimationFrame(frame);
      }
      frame = requestAnimationFrame(() => {
        handleScroll(event);
        frame = void 0;
      });
    };
    const options = { passive: true };
    wrapper.addEventListener("scroll", handleScrollAsync, options);
    return () => {
      wrapper.removeEventListener("scroll", handleScrollAsync, options);
    };
  });
  user_effect(() => {
    $$props.scrollToIndex;
    scrollToAlignment();
    $$props.scrollOffset;
    $$props.itemCount;
    $$props.itemSize;
    get(estimatedItemSize);
    get(heightNumber);
    get(widthNumber);
    stickyIndices();
    untrack(propsUpdated);
  });
  user_effect(() => {
    get(scroll);
    untrack(scrollUpdated);
  });
  function propsUpdated() {
    const scrollPropsHaveChanged = strict_equals(prevProps.scrollToIndex, $$props.scrollToIndex, false) || strict_equals(prevProps.scrollToAlignment, scrollToAlignment(), false);
    const itemPropsHaveChanged = strict_equals(prevProps.itemCount, $$props.itemCount, false) || strict_equals(prevProps.itemSize, $$props.itemSize, false) || strict_equals(prevProps.estimatedItemSize, get(estimatedItemSize), false);
    let forceRecomputeSizes = false;
    if (itemPropsHaveChanged) {
      sizeAndPositionManager.updateConfig($$props.itemSize, $$props.itemCount, get(estimatedItemSize));
      forceRecomputeSizes = true;
    }
    if (strict_equals(prevProps.scrollOffset, $$props.scrollOffset, false)) {
      set(scroll, {
        offset: $$props.scrollOffset || 0,
        changeReason: SCROLL_CHANGE_REASON.REQUESTED
      });
    } else if (strict_equals(typeof $$props.scrollToIndex, "number") && (scrollPropsHaveChanged || itemPropsHaveChanged)) {
      set(scroll, {
        offset: getOffsetForIndex($$props.scrollToIndex),
        changeReason: SCROLL_CHANGE_REASON.REQUESTED
      });
    }
    if (forceRecomputeSizes || strict_equals(prevProps.heightNumber, get(heightNumber), false) || strict_equals(prevProps.widthNumber, get(widthNumber), false) || strict_equals(prevProps.stickyIndices.toString(), snapshot(stickyIndices()).toString(), false)) {
      recomputeSizes();
    }
    prevProps = {
      scrollToIndex: snapshot($$props.scrollToIndex),
      scrollToAlignment: snapshot(scrollToAlignment()),
      scrollOffset: snapshot($$props.scrollOffset),
      itemCount: snapshot($$props.itemCount),
      itemSize: strict_equals(typeof $$props.itemSize, "function") ? $$props.itemSize : snapshot($$props.itemSize),
      estimatedItemSize: snapshot(get(estimatedItemSize)),
      heightNumber: snapshot(get(heightNumber)),
      widthNumber: snapshot(get(widthNumber)),
      stickyIndices: snapshot(stickyIndices())
    };
  }
  function scrollUpdated() {
    if (strict_equals(prevScroll.offset, get(scroll).offset, false) || strict_equals(prevScroll.changeReason, get(scroll).changeReason, false)) {
      refresh();
    }
    if (strict_equals(prevScroll.offset, get(scroll).offset, false) && strict_equals(get(scroll).changeReason, SCROLL_CHANGE_REASON.REQUESTED)) {
      wrapper.scroll({
        [SCROLL_PROP[scrollDirection()]]: get(scroll).offset,
        behavior: scrollToBehaviour()
      });
    }
    prevScroll = snapshot(get(scroll));
  }
  function refresh() {
    const { start, end } = sizeAndPositionManager.getVisibleRange(strict_equals(scrollDirection(), DIRECTION.VERTICAL) ? get(heightNumber) : get(widthNumber), get(scroll).offset, overscanCount());
    const visibleItems = [];
    const totalSize = sizeAndPositionManager.getTotalSize();
    const heightUnit = strict_equals(typeof height(), "number") ? "px" : "";
    const widthUnit = strict_equals(typeof width(), "number") ? "px" : "";
    set(wrapperStyle, `height:${height()}${heightUnit};width:${width()}${widthUnit};`);
    if (strict_equals(scrollDirection(), DIRECTION.VERTICAL)) {
      set(innerStyle, `flex-direction:column;height:${totalSize}px;`);
    } else {
      set(innerStyle, `min-height:100%;width:${totalSize}px;`);
    }
    const hasStickyIndices = stickyIndices().length > 0;
    if (hasStickyIndices) {
      for (const index of stickyIndices()) {
        visibleItems.push({ index, style: getStyle(index, true) });
      }
    }
    if (strict_equals(start, void 0, false) && strict_equals(end, void 0, false)) {
      for (let index = start; index <= end; index++) {
        if (hasStickyIndices && stickyIndices().includes(index)) continue;
        visibleItems.push({ index, style: getStyle(index, false) });
      }
      if ($$props.onItemsUpdated) $$props.onItemsUpdated({ start, end });
      if ($$props.onListItemsUpdate) $$props.onListItemsUpdate({ start, end });
    }
    set(items, visibleItems);
  }
  function recomputeSizes(startIndex = $$props.scrollToIndex) {
    set(styleCache, {}, true);
    if (strict_equals(startIndex, void 0, false) && startIndex >= 0) {
      sizeAndPositionManager.resetItem(startIndex);
    }
    refresh();
  }
  function getOffsetForIndex(index) {
    if (index < 0 || index >= $$props.itemCount) index = 0;
    return sizeAndPositionManager.getUpdatedOffsetForIndex(scrollToAlignment(), strict_equals(scrollDirection(), DIRECTION.VERTICAL) ? get(heightNumber) : get(widthNumber), get(scroll).offset || 0, index);
  }
  function handleScroll(event) {
    const offset = wrapper[SCROLL_PROP_LEGACY[scrollDirection()]];
    if (offset < 0 || strict_equals(get(scroll).offset, offset) || strict_equals(event.target, wrapper, false)) return;
    set(scroll, {
      offset,
      changeReason: SCROLL_CHANGE_REASON.OBSERVED
    });
    if ($$props.onAfterScroll) $$props.onAfterScroll({ offset, event });
  }
  function getStyle(index, sticky) {
    if (get(styleCache)[index]) return get(styleCache)[index];
    const { size, offset } = sizeAndPositionManager.getSizeAndPositionForIndex(index);
    let style;
    if (strict_equals(scrollDirection(), DIRECTION.VERTICAL)) {
      style = `left:0;width:100%;height:${size}px;`;
      if (sticky) {
        style += `position:sticky;flex-grow:0;z-index:1;top:0;margin-top:${offset}px;margin-bottom:${-(offset + size)}px;`;
      } else {
        style += `position:absolute;top:${offset}px;`;
      }
    } else {
      style = `top:0;width:${size}px;`;
      if (sticky) {
        style += `position:sticky;z-index:1;left:0;margin-left:${offset}px;margin-right:${-(offset + size)}px;`;
      } else {
        style += `position:absolute;height:100%;left:${offset}px;`;
      }
    }
    get(styleCache)[index] = style;
    return get(styleCache)[index];
  }
  var div = root();
  var node = child(div);
  {
    var consequent = ($$anchor2) => {
      var fragment = comment();
      var node_1 = first_child(fragment);
      snippet(node_1, () => $$props.header);
      append($$anchor2, fragment);
    };
    if_block(node, ($$render) => {
      if ($$props.header) $$render(consequent);
    });
  }
  var div_1 = sibling(node, 2);
  validate_each_keys(() => get(items), (item) => $$props.getKey ? $$props.getKey(item.index) : item.index);
  each(div_1, 21, () => get(items), (item) => $$props.getKey ? $$props.getKey(item.index) : item.index, ($$anchor2, item) => {
    var fragment_1 = comment();
    var node_2 = first_child(fragment_1);
    snippet(node_2, () => $$props.children || $$props.item, () => ({
      style: get(item).style,
      index: get(item).index
    }));
    append($$anchor2, fragment_1);
  });
  reset(div_1);
  var node_3 = sibling(div_1, 2);
  {
    var consequent_1 = ($$anchor2) => {
      var fragment_2 = comment();
      var node_4 = first_child(fragment_2);
      snippet(node_4, () => $$props.footer);
      append($$anchor2, fragment_2);
    };
    if_block(node_3, ($$render) => {
      if ($$props.footer) $$render(consequent_1);
    });
  }
  reset(div);
  bind_this(div, ($$value) => wrapper = $$value, () => wrapper);
  template_effect(() => {
    set_style(div, get(wrapperStyle));
    set_style(div_1, get(innerStyle));
  });
  bind_element_size(div, "offsetHeight", ($$value) => set(wrapperHeight, $$value));
  bind_element_size(div, "offsetWidth", ($$value) => set(wrapperWidth, $$value));
  append($$anchor, div);
  return pop({
    get recomputeSizes() {
      return recomputeSizes;
    },
    ...legacy_api()
  });
}
if (import.meta.hot) {
  VirtualList = hmr(VirtualList, () => VirtualList[HMR].source);
  import.meta.hot.accept((module) => {
    cleanup_styles("s-LBoz29dSa-wv");
    module.default[HMR].source = VirtualList[HMR].source;
    set(VirtualList[HMR].source, module.default[HMR].original);
  });
}
var VirtualList_default = VirtualList;
export {
  VirtualList_default as default
};
//# sourceMappingURL=svelte-tiny-virtual-list.js.map
