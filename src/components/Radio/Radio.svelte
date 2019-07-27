<script>
  import { beforeUpdate, onDestroy, onMount } from "svelte";
  import { MDCRadio } from "@material/radio";
  import { processClasses } from "../helpers";
  const attrKeys = ["value", "checked", "disabled"];

  export let radio;
  export let id;
  export let name;
  export let group;
  export let value;
  export let attrs;
  
  let mdcComponent;

  onMount(() => {
    mdcComponent = new MDCRadio(radio);
  });

  onDestroy(() => {
    mdcComponent && mdcComponent.destroy();
  });

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
    {name}
    bind:group
    {value}
  />
  <div class="mdc-radio__background">
    <div class="mdc-radio__outer-circle"></div>
    <div class="mdc-radio__inner-circle"></div>
  </div>
</div>
