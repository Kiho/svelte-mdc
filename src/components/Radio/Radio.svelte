<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCRadio } from "@material/radio";
  import { processClasses } from "../helpers";
  const attrKeys = ["value", "checked", "disabled"];

  export let radio;
  export let id;
  export let name;
  let mdcComponent;

  onMount(() => {
    mdcComponent = new MDCRadio(radio);
  });

  onDestroy(() => {
    mdcComponent && mdcComponent.destroy();
  });

  // [svelte-upgrade warning]
  // beforeUpdate and afterUpdate handlers behave
  // differently to their v2 counterparts
  beforeUpdate(() => {
    // for (let key of attrKeys) {
    //   if (changed[key]) {
    //     mdcComponent[key] = current[key];
    //   }
    // }
  });

  export let attrs;
  $: {
    let result = Object.assign({}, $$props);
    let cls = "mdc-radio";
    let classes = [cls];
    let key = "disabled";
    if (result[key]) {
      classes.push(cls + "--" + key);
    }
    delete result[key];
    for (let key of ["id", "name", ...attrKeys]) {
      delete result[key];
    }
    result["class"] = processClasses(classes, result["class"]);
    attrs = result;
  }

  // export function getMDCField() {
  //   return mdcComponent;
  // }
</script>

<div bind:this="{radio}" {...attrs}>
  <input
    class="mdc-radio__native-control"
    type="radio"
    id="{id}"
    name="{name}"
  />
  <div class="mdc-radio__background">
    <div class="mdc-radio__outer-circle"></div>
    <div class="mdc-radio__inner-circle"></div>
  </div>
</div>
