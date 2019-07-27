<script>
	import {
		Button, Fab, Card, Checkbox,
		Dialog, DialogButton, LinearProgress,
		Icon, IconToggle,
		Body, Subheading, Title, Display, Headline,
    LayoutGrid,
    LayoutGridCell,
		LayoutGridInner,
		Menu, MenuItem,
		Tab, TabBar, TabScroller
  } from './components';

	export let customStyles = {
    '--mdc-theme-primary': '#CDDC39'
  };
  export let name = 'Svelte Material Components';
  export let checkboxValue = true;
  export let iconToggle = false;
  export let progressbar = null;
	export let dialog = null;
	export let menu = null;

	function showDialog() {
		dialog.show();
	}

	function showMenu() {
		menu.show(true);
	}

	export function iconEvent(value) {
    console.log('IconToggle clicked', value)
  }
</script>

<LayoutGrid fixedColumnWidth>
	<Display level="2" adjustMargin>svelte-mdc</Display>

	<Headline adjustMargin>{name}</Headline>

	<Title>Buttons</Title>
	<Button icon="build" raised href="#">Build me!</Button>
	<Button icon="grade" unelevated background="secondary-dark">Grade me!</Button>
	<Button icon="cake" color="secondary-dark">Eat me!</Button>
	<Button icon="ac_unit" unelevated dense disabled>Disable me!</Button>
	<Button icon="build" raised compact href="#">Build me!</Button>
	<Button icon="grade" stroked type="submit">Grade me!</Button>

	<Title>Floating action buttons</Title>
	<LayoutGridInner>
		<LayoutGridCell span="12">
			<Fab icon="add" background="primary" />
			<Fab icon="star" mini />
			<Fab icon="school" background="secondary" />
			<Fab icon="add" label="Create" extended ripple />
		</LayoutGridCell>
	</LayoutGridInner>

	<Subheading level="2">Subheading level 2</Subheading>

	<Body>
		Material Components for the web (MDC-Web) helps developers execute Material Design. Developed by a core team of engineers and UX designers at Google, these components enable a reliable development workflow to build beautiful and functional web projects.
	</Body>

	<Title>Cards</Title>
	<LayoutGridInner>
		<LayoutGridCell span="6">
			<Card ripple>
				<span slot="title"><Title>Title</Title></span>
				<span slot="subtitle"><Subheading level="1">Subtitle</Subheading></span>
				<span slot="supportingText">
					<Body level="1">
						Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
					</Body>
				</span>
				<span slot="actions">
					<Button href="https://github.com/matsp/material-components-vue/blob/master/components/Card">
						github
					</Button>
				</span>
			</Card>
		</LayoutGridCell>
	</LayoutGridInner>

	<Title>Checkboxes</Title>
	<LayoutGridInner>
		<LayoutGridCell span="1">
			<Checkbox checked="{checkboxValue}" />
		</LayoutGridCell>
	</LayoutGridInner>

	<Title>Menus</Title>
	<LayoutGridInner>
		<LayoutGridCell span="6">
			<div id="demo-menu" class="mdc-menu-surface--anchor">
				<Button on:click={showMenu} icon="build" raised>Open Menu</Button>
				<Menu bind:this={menu}>
					<MenuItem>A Menu Item</MenuItem>
					<MenuItem>Another Menu Item</MenuItem>
				</Menu>
			</div>
		</LayoutGridCell>
	</LayoutGridInner>

	<Title>Tabs</Title>
	<LayoutGridInner>
		<LayoutGridCell span="6">
			<TabBar>
				<TabScroller>
					<Tab href="#access_time" icon="access_time" active >
						Recents
					</Tab>
					<Tab href="#near_me" icon="near_me" >
						Near By
					</Tab>
					<Tab href="#favorite" icon="favorite" >
						Favorites
					</Tab>
				</TabScroller>
			</TabBar>
		</LayoutGridCell>
	</LayoutGridInner>

	<Title>TextFields</Title>

	<LayoutGridInner>
		<LayoutGridCell span="12">
			<div class="drawer-demo">
				<div>
					<iframe class="drawer-iframe" title="Text Fields" src="text-field.html"></iframe>
				</div>
			</div>
		</LayoutGridCell>
	</LayoutGridInner>

	<Title>Drawers</Title>

	<LayoutGridInner>
		<LayoutGridCell span="12">
			<div class="drawer-demo">
				<div>
					<a href="drawer.html" target="_blank"><h3 class="mdc-typography--subtitle1">Permanent</h3></a>
				</div>
				<div>
					<iframe class="drawer-iframe" title="Permanent" src="drawer.html"></iframe>
				</div>
			</div>
		</LayoutGridCell>
	</LayoutGridInner>

	<LayoutGridInner>
		<LayoutGridCell span="12">
			<div class="drawer-demo">
					<div>
						<a href="drawer.html?dismissible=1" target="_blank"><h3 class="mdc-typography--subtitle1">Dismissible</h3></a>
					</div>
					<div>
						<iframe class="drawer-iframe" title="Permanent" src="drawer.html?dismissible=1"></iframe>
					</div>
				</div>	
		</LayoutGridCell>
	</LayoutGridInner>

	<LayoutGridInner>
			<LayoutGridCell span="12">
				<div class="drawer-demo">
						<div>
							<a href="drawer.html?modal=1" target="_blank"><h3 class="mdc-typography--subtitle1">Modal</h3></a>
						</div>
						<div>
							<iframe class="drawer-iframe" title="Permanent" src="drawer.html?modal=1"></iframe>
						</div>
					</div>	
			</LayoutGridCell>
		</LayoutGridInner>

	<Title>Dialogs</Title>
	<LayoutGridInner>
		<LayoutGridCell span="6">
			<Button unelevated background="secondary-dark" on:click="{showDialog}" >Alert</Button>
			<Dialog bind:this="{dialog}">
				<span slot="header">My first dialog</span>
				<p slot="body">
					Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
				</p>
				<span slot="footer">
					<DialogButton label="Cancel" action="close" />
					<DialogButton label="OK" action="accept" />
				</span>
			</Dialog>
		</LayoutGridCell>
	</LayoutGridInner>

	<LayoutGridInner>
		<LayoutGridCell span="2">
			<Subheading level="1">Icon</Subheading>
			<Icon icon="cloud" />
		</LayoutGridCell>
		<LayoutGridCell span="2">
			<Subheading level="1">IconButton</Subheading>
			<IconToggle icon="favorite" accent />
		</LayoutGridCell>
		<LayoutGridCell span="2">
			<Subheading level="1">IconToggle</Subheading>
			<IconToggle value="{iconToggle}" iconOn="favorite" iconOff="favorite_border" on:input="{(event)=>iconEvent(event.value)}" accent />
		</LayoutGridCell>
	</LayoutGridInner>

	<Title>Linear Progress</Title>

	<LayoutGridInner>
		<LayoutGridCell>
			<LinearProgress bind:this={progressbar} progressbar={progressbar} open progress="0.5" buffer="0.5" indeterminate />
		</LayoutGridCell>
	</LayoutGridInner>
</LayoutGrid>

<style>
	.drawer-demo {
    display: inline-block;
    -ms-flex: 1 1 80%;
    flex: 1 1 80%;
    -ms-flex-pack: distribute;
    justify-content: space-around;
    min-height: 400px;
		width: 100%;
    padding: 15px;
	}
	.drawer-iframe {
    width: 100%;
    height: 425px;
	}
</style>