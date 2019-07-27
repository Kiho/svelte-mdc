<script>
	import {
		Checkbox,
		Icon,
		Tab, TabBar, TabScroller,
    Radio
  } from '../components';
  import { TextField, TextFieldCharacterCounter } from '../components';

  export let name = '';
  export let text = '';
  export let outlined = true;
  export let disabled = false;

  const icons = ['favorite', 'visibility'];
  const messages = ['Helper message', 'Error message'];
  let icon;
  let iconMode;
  let leading = false;
  let trailing = false;

  $: if (leading) {
    icon = icons[0];
    iconMode = 'leading';
  } 
  $: if (trailing) {
    icon = icons[1];
    iconMode = 'trailing';
  }
  $: if (!leading && !trailing) {
    icon = '';
    iconMode = '';
  }

  let label = 'label';
  let activeIndex = 0;
  let characterCounter = false;
  let invalid = false;
  let helperText = '';
  let errorMessage = '';
  let selected = '';

  $: {
    console.log('selected', selected);
    if (selected == 0) {
      helperText = '';
      invalid = false;
    } else if (selected == 1) {
      helperText = messages[0];
      invalid = false;
    } else if (selected == 2) {
      helperText = messages[1];
      invalid = true;
    }
  }

	function updatePanel(e) {    
    activeIndex = e.detail.activeTabIndex;
  }
</script>

<div id="root-container">
  <div class="component-demo component-demo--open">
    <div class="component-demo__content">
      <div class="component-demo__app-bar">
        <div class="component-demo__tab-section">
          <TabBar on:change={updatePanel} >
            <TabScroller>
              <Tab href="#filled" active className="component-demo__tab" >
                Filled
              </Tab>
              <Tab href="#outlined" className="component-demo__tab" >
                Outlined
              </Tab>
            </TabScroller>
          </TabBar>
        </div>
      </div>
      <div class="component-demo__stage-content">
        <div id="filled" class="stage-transition-container-variant" class:stage-transition-container-variant--show={activeIndex == 0} >
          <div class="inline-text-field-container">
            <TextField id="TextField1" bind:value={text} {disabled} {label} maxLength="100" {characterCounter} {icon} {iconMode} {helperText} {invalid} />
          </div> 
        </div>
        <div id="outlined" class="stage-transition-container-variant" class:stage-transition-container-variant--show={activeIndex == 1} >
          <div class="inline-text-field-container">
            <TextField id="TextField2" bind:value={text} outlined {disabled} {label} maxLength="100" {characterCounter} {icon} {iconMode} {helperText} {invalid} />
          </div>
        </div>
      </div>
      <div class="component-demo__config-panel">
        <div class="component-demo__panel-header"> 
          <div class="component-demo__panel-header-label">
            Configuration
          </div>      
        </div>
        <div class="text-field-options">
          <span class="text-field-options__label">Options</span>
          <div class="text-field-options__checkbox">
            <div class="mdc-form-field">            
              <Checkbox id="chk1" bind:checked={characterCounter} />
              <label for="chk1" >Text Counter</label>
            </div>
          </div> 
          <div class="text-field-options__checkbox">
            <div class="mdc-form-field">            
              <Checkbox id="chk2" bind:checked={disabled} />
              <label for="chk2" >Disabled</label>
            </div>
          </div>    
          <div class="text-field-options__checkbox">
            <div class="mdc-form-field">            
              <Checkbox id="chk3" bind:checked={leading} />
              <label for="chk3" >Leading Icon</label>
            </div>
          </div>     
          <div class="text-field-options__checkbox">
            <div class="mdc-form-field">            
              <Checkbox id="chk4" bind:checked={trailing} />
              <label for="chk4" >Trailing Icon</label>
            </div>
          </div>
          <span class="text-field-options__label">Assistive text</span>
          <div class="text-field-options__radio-group">
            <div class="mdc-form-field">
              <Radio id="radio1" name="assistive-text" bind:group={selected} value="0"/>
              <label for="radio1">None</label>
            </div>
            <div class="mdc-form-field">
              <Radio id="radio1" name="assistive-text" bind:group={selected} value="1" />
              <label for="radio1">Helper text</label>
            </div>
            <div class="mdc-form-field">
              <Radio id="radio1" name="assistive-text" bind:group={selected} value="2" />
              <label for="radio1">Error text</label>
            </div> 
          </div>
        </div>
      </div>     
    </div>
  </div>
</div>

<style>
  #root-container {
    height: 100%;
    margin: 0;
    padding: 0;
  }
  .component-demo {
    height: 100%;
    display: flex;
    flex-direction: row;
  }
  .component-demo .component-demo__content {
    flex-direction: column;
    display: flex;
    height: 100%;
    width: 100%;
    transition: width;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    transition-duration: 250ms;
  }
  
  .component-demo .component-demo__config-panel{background-color:#fff;border-left:1px solid rgba(0,0,0,.1);position:fixed;right:-200px;z-index:10;height:100%;width:200px;transition-timing-function:cubic-bezier(0.4, 0, 0.2, 1);transition-duration:250ms;transition-property:right}
  .component-demo .component-demo__panel-header{height:48px;padding-left:16px;padding-right:4px;border-bottom:1px solid #eee;display:flex;justify-content:space-between}
  .component-demo .component-demo__panel-header-label{font-family:Roboto,sans-serif;-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;font-size:.875rem;line-height:1.375rem;font-weight:500;letter-spacing:.0071428571em;text-decoration:inherit;text-transform:inherit;display:flex;align-items:center;flex:1 1 auto;line-height:1.25rem;font-weight:400;opacity:.87}

  .component-demo--open .component-demo__content{width:calc(100% - 200px)}
  .component-demo--open .component-demo__config-panel{right:0}
  .component-demo--open .component-demo__config-button{visibility:hidden;transition-delay:0ms}

  .component-demo__app-bar {
    background-color: #fff;
    flex-shrink: 0;
    height: 48px;
    padding-left: 16px;
    padding-right: 4px;
    border-bottom: 1px solid #eee;
    display: flex;
  }
  .component-demo__tab-section {
    display: flex;
    /* flex: 1 1 auto;  */
    justify-content: flex-start;
  }
  .component-demo__tab {
    padding-right: 12px;
    padding-left: 12px;
  }
  .component-demo__stage-content {
    background: #fff;
    flex: 1 1 auto;
    min-height: 250px;
    position: relative;
  }
  .component-demo .component-demo__panel-header {
    height: 48px;
    padding-left: 16px;
    padding-right: 4px;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
  }
  .text-field-options {
    padding: 4px 4px 16px;
  }
  .stage-transition-container-variant {
    position: absolute;
    padding: 40px;
    bottom: 0;
    left: 0;
    right: 0;
    top: 0;
    align-items: center;
    display: flex;
    justify-content: center;
    opacity: 0;
    transition-duration: 250ms;
    transition-property: opacity,visibility;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
    visibility: hidden;
    z-index: 0;
  }
  .stage-transition-container-variant--show {
    opacity: 1;
    visibility: visible;
  }
  .inline-text-field-container {
    display: flex;
    flex-direction: column;
  }
  .component-demo .component-demo__panel-header-label {
    font-family: Roboto,sans-serif;
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    font-size: .875rem;
    line-height: 1.375rem;
    font-weight: 500;
    letter-spacing: .0071428571em;
    text-decoration: inherit;
    text-transform: inherit;
    display: flex;
    align-items: center;
    flex: 1 1 auto;
    line-height: 1.25rem;
    font-weight: 400;
    opacity: .87;
  }

  .text-field-options__label {
    font-family: Roboto,sans-serif;
    -moz-osx-font-smoothing: grayscale;
    -webkit-font-smoothing: antialiased;
    font-size: .875rem;
    line-height: 1.375rem;
    font-weight: 500;
    letter-spacing: .0071428571em;
    text-decoration: inherit;
    text-transform: inherit;
    display: block;
    margin: 16px 0 8px;
    padding: 0 12px;
    line-height: 1.25rem;
    font-weight: 400;
    opacity: .87;
  }
  .text-field-options__checkbox {
    padding: 0 0 0 8px;
  }
  .text-field-options__radio-group {
    padding: 0 0 0 8px;
  }
</style>