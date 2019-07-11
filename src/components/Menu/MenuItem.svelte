<script>
  import { processClasses } from "../helpers.js";
  export let showMeta = false;
  export let showGraphic = false;

  import { ListItem } from "../List";

  export let attrs;
  $: {
    const classes = [];
    let result = Object.assign({ role: "menuitem" }, $$props);
    if (result.disabled) {
      result.tabindex = "-1";
      result["aria-disabled"] = "true";
    }
    for (let key of [
      "selected",
      "disabled",
      "activated",
      "primaryText",
      "secondText",
      "showGraphic",
      "showMeta"
    ]) {
      delete result[key];
    }
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }
</script>

<ListItem {...attrs}>
  <slot></slot>
</ListItem>
