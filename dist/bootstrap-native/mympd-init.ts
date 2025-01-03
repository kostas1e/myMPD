import { Data, getElementsByTagName, matches } from "@thednp/shorty";

import { addListener } from "@thednp/event-listener";

import Alert from "../components/alert";
import Button from "../components/button";
import Carousel from "../components/carousel";
import Collapse from "../components/collapse";
import Dropdown from "../components/dropdown";
import Modal from "../components/modal";
import Offcanvas from "../components/offcanvas";
import Popover from "../components/popover";
import Tab from "../components/tab";
import Toast from "../components/toast";

const componentsList = new Map<
  string,
  | typeof Alert
  | typeof Button
  | typeof Carousel
  | typeof Collapse
  | typeof Dropdown
  | typeof Modal
  | typeof Offcanvas
  | typeof Popover
  | typeof Tab
  | typeof Toast
>();

type Component =
  | Alert
  | Button
  | Carousel
  | Collapse
  | Dropdown
  | Modal
  | Offcanvas
  | Popover
  | Tab
  | Toast;

[
  Alert,
  Button,
  Carousel,
  Collapse,
  Dropdown,
  Modal,
  Offcanvas,
  Popover,
  Tab,
  Toast,
].forEach((c) => componentsList.set(c.prototype.name, c));

/**
 * Initialize all matched `Element`s for one component.
 *
 * @param callback
 * @param collection
 */
const initComponentDataAPI = (
  callback: (el: Element) => Component,
  collection: HTMLCollectionOf<Element> | Element[],
) => {
  [...collection].forEach((x) => callback(x));
};

/**
 * Remove one component from a target container element or all in the page.
 *
 * @param component the component name
 * @param context parent `Node`
 */
const removeComponentDataAPI = <T>(component: string, context: ParentNode) => {
  const compData = Data.getAllFor(component) as Map<Element, T>;

  if (compData) {
    [...compData].forEach(([element, instance]) => {
      if (context.contains(element)) {
        (instance as T & { dispose: () => void }).dispose();
      }
    });
  }
};

/**
 * Initialize all BSN components for a target container.
 *
 * @param context parent `Node`
 */
export const initCallback = (context?: ParentNode) => {
  const lookUp = context && context.nodeName ? context : document;
  const elemCollection = [...getElementsByTagName<Element>("*", lookUp)];

  componentsList.forEach((cs) => {
    const { init, selector } = cs;
    initComponentDataAPI(
      init,
      elemCollection.filter((item) => matches(item, selector)),
    );
  });
};

/**
 * Remove all BSN components for a target container.
 *
 * @param context parent `Node`
 */
export const removeDataAPI = (context?: ParentNode) => {
  const lookUp = context && context.nodeName ? context : document;

  componentsList.forEach((comp) => {
    removeComponentDataAPI(comp.prototype.name, lookUp);
  });
};

// Bulk initialize all components
if (document.body) initCallback();
else {
  addListener(document, "DOMContentLoaded", () => initCallback(), {
    once: true,
  });
}
