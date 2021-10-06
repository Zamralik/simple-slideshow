const enum AnimationName
{
	fade = "fade",
	slide = "slide"
}

const enum OrientationName
{
	left = "left",
	right = "right"
}

const enum ElementName
{
	container = "simple-slideshow",
	viewport = "slideshow-viewport",
	rail = "slideshow-rail",
	slide = "slideshow-slide",
	nav = "slideshow-bullets",
	bullet = "button",
	arrow = "button"
}

const enum ClassName
{
	bullet = "slideshow-bullet",
	arrow = "slideshow-arrow"
}

const enum ElementSelector
{
	container = "simple-slideshow",
	viewport = "slideshow-viewport",
	rail = "slideshow-rail",
	slide = "slideshow-slide",
	nav = "slideshow-bullets",
	bullet = "button.slideshow-bullet",
	arrow = "button.slideshow-arrow"
}

type ArrowBuilder = (orientation: OrientationName) => ChildNode;
type BulletBuilder = (index: number) => ChildNode;

interface Configuration
{
	elements?: Array<Element>;
	elementsSelector?: string;
	fullWidthSlide?: boolean;
	animation?: AnimationName;
	draggable?: boolean;
	addArrows?: boolean;
	arrowBuilder?: ArrowBuilder;
	addBullets?: boolean;
	bulletBuilder?: BulletBuilder;
	autoplayDelay?: number;
}

class SimpleSlideshow extends HTMLElement
{
	private viewport: HTMLElement;
	private rail: HTMLElement;
	private nav: HTMLElement;
	private slides: Array<HTMLElement> = [];
	private bullets: Array<HTMLElement> = [];
	private animation: AnimationName|undefined;
	private fullWidthSlide: boolean = false;
	private showArrows: boolean = false;
	private showBullets: boolean = false;
	private skipNextAutoplay: boolean = false;
	private activeIndex: number = 0;
	private dragStartingPoint: number = 0;
	private currentOffset: number = 0;
	private autoplayId: number = 0;
	private resizeId: number = 0;
	private touchId: number = 0;
	private beingDraggedRemote: AbortController|null = null;
	private draggableRemote: AbortController|null = null;

	public constructor()
	{
		super();

		this.viewport = this.initializeViewport();
		this.rail = this.initializeRail();
		this.nav = this.initializeNav();
	}

	public initialize(configuration: Configuration): void
	{
		this.initializeSlides(configuration);
		this.setFullWidthSlide(configuration.fullWidthSlide ?? true);
		this.changeAnimation(configuration.animation ?? AnimationName.slide);

		if (configuration.addArrows ?? false)
		{
			this.addArrows(configuration.arrowBuilder);
		}

		if (configuration.addBullets ?? false)
		{
			this.addBullets(configuration.bulletBuilder);
		}

		if (this.animation === AnimationName.slide)
		{
			if (configuration.draggable ?? true)
			{
				this.enableDragging();
			}
		}
		else if (configuration.draggable === true)
		{
			throw new Error("Unable to enable dragging if animation is not set to slide");
		}

		if (configuration.autoplayDelay !== undefined)
		{
			this.startAutoplay(configuration.autoplayDelay);
		}

		window.addEventListener(
			"resize",
			(): void =>
			{
				if (this.resizeId > 0)
				{
					clearTimeout(this.resizeId);
				}

				this.resizeId = setTimeout(
					(): void =>
					{
						this.refresh();
					},
					500
				);
			}
		);
	}

	public changeAnimation(animation: AnimationName): void
	{
		if (this.animation === animation)
		{
			return;
		}

		if (this.animation !== undefined)
		{
			this.classList.remove(this.animation);
		}

		this.animation = animation;
		this.classList.add(animation);

		if (animation === AnimationName.slide)
		{
			this.enableDragging();
		}
		else
		{
			this.rail.style.left = "";
			this.disableDragging();
		}
	}

	public setFullWidthSlide(flag: boolean): void
	{
		if (this.fullWidthSlide === flag)
		{
			return;
		}

		this.fullWidthSlide = flag;

		if (flag)
		{
			const WIDTH: string = this.toPixel(this.computeViewportWidth());

			this.slides.forEach(
				(slide: HTMLElement): void =>
				{
					slide.style.width = WIDTH;
				}
			);
		}
		else
		{
			this.slides.forEach(
				(slide: HTMLElement): void =>
				{
					slide.style.width = "";
				}
			);
		}
	}

	public addArrows(generator?: ArrowBuilder|undefined): void
	{
		if (this.showArrows)
		{
			this.removeArrows();
		}

		this.showArrows = true;

		const LEFT_ARROW: HTMLElement = document.createElement(ElementName.arrow);
		const RIGHT_ARROW: HTMLElement = document.createElement(ElementName.arrow);

		if (generator !== undefined)
		{
			LEFT_ARROW.append(generator(OrientationName.left));
			RIGHT_ARROW.append(generator(OrientationName.right));
		}

		this.append(LEFT_ARROW);
		this.append(RIGHT_ARROW);

		LEFT_ARROW.classList.add(ClassName.arrow, OrientationName.left);
		RIGHT_ARROW.classList.add(ClassName.arrow, OrientationName.right);

		LEFT_ARROW.addEventListener(
			"click",
			(): void =>
			{
				this.previousSlide();
			}
		);

		RIGHT_ARROW.addEventListener(
			"click",
			(): void =>
			{
				this.nextSlide();
			}
		);
	}

	public removeArrows()
	{
		if (!this.showArrows)
		{
			return;
		}

		this.showArrows = false;

		this.querySelectorAll(ElementSelector.arrow).forEach(
			(arrow: Element): void =>
			{
				arrow.remove();
			}
		);
	}

	public addBullets(generator?: BulletBuilder|undefined): void
	{
		if (this.showBullets)
		{
			this.removeBullets();
		}

		this.showBullets = true;

		const LENGTH: number = this.slides.length;

		for (let index = 0; index < LENGTH; ++index)
		{
			const BULLET: HTMLElement = document.createElement(ElementName.bullet);

			BULLET.classList.add(ClassName.bullet);
			BULLET.classList.toggle("active", index === this.activeIndex);
			this.nav.append(BULLET);
			this.bullets.push(BULLET);

			if (generator === undefined)
			{
				BULLET.textContent = (index + 1).toFixed(0);
			}
			else
			{
				BULLET.append(generator(index));
			}

			BULLET.addEventListener(
				"click",
				(): void =>
				{
					this.changeSlide(index);
				}
			);
		}

		this.append(this.nav);
	}

	public removeBullets(): void
	{
		if (!this.showBullets)
		{
			return;
		}

		this.showBullets = false;

		this.bullets.forEach(
			(bullet: HTMLElement): void =>
			{
				bullet.remove();
			}
		);

		this.bullets = [];
		this.nav.remove();
	}

	public nextSlide(): void
	{
		++this.activeIndex;

		if (this.activeIndex >= this.slides.length)
		{
			this.activeIndex = 0;
		}

		this.slideTransition();
	}

	public previousSlide(): void
	{
		if (this.activeIndex > 0)
		{
			--this.activeIndex;
		}
		else
		{
			this.activeIndex = this.slides.length - 1;
		}

		this.slideTransition();
	}

	public changeSlide(index: number): void
	{
		if (index < 0 || this.slides.length <= index)
		{
			throw new Error("Out of bound index");
		}

		this.activeIndex = index;

		this.slideTransition();
	}

	public enableDragging(): void
	{
		if (this.animation !== AnimationName.slide)
		{
			throw new Error("Requires a slide animation to enable dragging");
		}

		if (this.draggableRemote !== null)
		{
			return;
		}

		this.draggableRemote = new AbortController();

		this.rail.addEventListener(
			"touchstart",
			(event: TouchEvent): void =>
			{
				event.preventDefault();

				if (this.touchId !== 0)
				{
					return;
				}

				const TOUCH: Touch|undefined = event.changedTouches[0];

				if (TOUCH instanceof Touch)
				{
					this.touchId = TOUCH.identifier;
					this.dragStart(TOUCH.clientX);
				}
				else
				{
					throw new Error("Empty TouchList");
				}
			},
			{
				signal: this.draggableRemote.signal
			}
		);

		this.rail.addEventListener(
			"mousedown",
			(event: MouseEvent): void =>
			{
				event.preventDefault();
				this.dragStart(event.clientX);
			},
			{
				signal: this.draggableRemote.signal
			}
		);
	}

	public disableDragging(): void
	{
		if (this.draggableRemote === null)
		{
			return;
		}

		this.dragEnd();
		this.draggableRemote.abort();
		this.draggableRemote = null;
	}

	public startAutoplay(delay: number): void
	{
		if (!Number.isSafeInteger(delay) || delay < 1)
		{
			throw new Error("Autoplay delay must be a safe positive integer");
		}

		this.stopAutoplay();
		this.skipNextAutoplay = false;

		this.autoplayId = setInterval(
			(): void =>
			{
				if (!this.skipNextAutoplay)
				{
					this.nextSlide();
				}

				this.skipNextAutoplay = false;
			},
			delay
		);
	}

	public stopAutoplay(): void
	{
		if (this.autoplayId !== 0)
		{
			clearInterval(this.autoplayId);
			this.autoplayId = 0;
		}
	}

	public refresh(): void
	{
		if (this.resizeId > 0)
		{
			clearTimeout(this.resizeId);
			this.resizeId = 0;
		}

		const WIDTH: string = this.toPixel(this.computeViewportWidth());

		if (this.fullWidthSlide)
		{
			this.slides.forEach(
				(slide: HTMLElement): void =>
				{
					slide.style.setProperty("width", WIDTH);
				}
			);
		}

		this.updateRailWidth();

		if (this.animation === AnimationName.slide)
		{
			this.slideTransition();
		}
	}

	private initializeViewport(): HTMLElement
	{
		let viewport: HTMLElement|null = this.querySelector(ElementName.viewport);

		if (viewport === null)
		{
			viewport = document.createElement(ElementName.viewport);
			this.append(viewport);
		}

		return viewport;
	}

	private initializeRail(): HTMLElement
	{
		let rail: HTMLElement|null = this.querySelector(ElementName.rail);

		if (rail === null)
		{
			rail = document.createElement(ElementName.rail);
			this.viewport.append(rail);
		}

		return rail;
	}

	private initializeNav(): HTMLElement
	{
		let nav: HTMLElement|null = this.querySelector(ElementName.nav);

		if (nav === null)
		{
			nav = document.createElement(ElementName.nav);
		}
		else
		{
			nav.remove();
		}

		return nav;
	}

	private initializeSlides(configuration: Configuration): void
	{
		const ELEMENTS: Array<HTMLElement> = this.extractElements(configuration);
		const WIDTH: string = this.toPixel(this.computeViewportWidth());

		ELEMENTS.forEach(
			(element: HTMLElement): void =>
			{
				const SLIDE = document.createElement(ElementName.slide);
				SLIDE.append(element);

				if (this.fullWidthSlide)
				{
					SLIDE.style.width = WIDTH;
				}

				this.rail.append(SLIDE);
				this.slides.push(SLIDE);
			}
		);

		this.updateRailWidth();
	}

	private extractElements(configuration: Configuration): Array<HTMLElement>
	{
		const ELEMENTS: Array<HTMLElement> = [];

		function add(element: Element): void
		{
			if (element instanceof HTMLElement)
			{
				ELEMENTS.push(element);
			}
		}

		if (configuration.elements !== undefined)
		{
			configuration.elements.forEach(add);
		}
		else if (configuration.elementsSelector !== undefined)
		{
			this.querySelectorAll(configuration.elementsSelector).forEach(add);
		}
		else
		{
			this.querySelectorAll("[data-slide]").forEach(add);
		}

		return ELEMENTS;
	}

	private slideTransition(): void
	{
		this.skipNextAutoplay = true;

		this.updateActive();

		if (this.animation === AnimationName.slide)
		{
			const SLIDE_OFFSET: number = this.computeSlideLeft(this.activeIndex);
			const RAIL_OFFSET: number = this.computeRailLeft();

			this.currentOffset = RAIL_OFFSET - SLIDE_OFFSET;
			this.rail.style.left = this.toPixel(this.currentOffset);
		}
	}

	private updateActive(): void
	{
		this.slides.forEach(
			(slide: HTMLElement, index: number): void =>
			{
				slide.classList.toggle("active", this.activeIndex === index);
			}
		);

		this.bullets.forEach(
			(bullet: HTMLElement, index: number): void =>
			{
				bullet.classList.toggle("active", this.activeIndex === index);
			}
		);
	}

	private computeViewportWidth(): number
	{
		return this.viewport.getBoundingClientRect().width;
	}

	private computeViewportLeft(): number
	{
		return this.viewport.getBoundingClientRect().left;
	}

	private computeRailLeft(): number
	{
		return this.rail.getBoundingClientRect().left;
	}

	private computeSlideLeft(index: number): number
	{
		const SLIDE: HTMLElement|null = this.slides[index];

		if (SLIDE === null)
		{
			throw new Error("No slide matching index");
		}

		return SLIDE.getBoundingClientRect().left;
	}

	private updateRailWidth(): void
	{
		let width: number = this.computeViewportWidth();

		if (this.animation === AnimationName.slide)
		{
			width *= this.slides.length + 4000;
		}

		this.rail.style.width = this.toPixel(width);
	}

	private dragStart(mouse_position: number): void
	{
		if (this.beingDraggedRemote !== null)
		{
			return;
		}

		this.rail.style.transition = "all 0s linear 0s";
		this.dragStartingPoint = mouse_position;
		this.beingDraggedRemote = new AbortController();

		window.addEventListener(
			"touchmove",
			(event: TouchEvent): void =>
			{
				event.preventDefault();

				const TOUCH: Touch|undefined = this.findTouch(event.changedTouches);

				if (TOUCH instanceof Touch)
				{
					this.dragUpdate(TOUCH.clientX);
				}
			},
			{
				signal: this.beingDraggedRemote.signal
			}
		);

		window.addEventListener(
			"touchend",
			(event: TouchEvent): void =>
			{
				event.preventDefault();

				const TOUCH: Touch|undefined = this.findTouch(event.changedTouches);

				if (TOUCH instanceof Touch)
				{
					this.dragEnd();
				}
			},
			{
				signal: this.beingDraggedRemote.signal
			}
		);

		this.rail.addEventListener(
			"mousemove",
			(event: MouseEvent): void =>
			{
				event.preventDefault();
				this.dragUpdate(event.clientX);
			},
			{
				signal: this.beingDraggedRemote.signal
			}
		);

		this.rail.addEventListener(
			"mouseup",
			(event: MouseEvent): void =>
			{
				event.preventDefault();
				this.dragEnd();
			},
			{
				signal: this.beingDraggedRemote.signal
			}
		);

		this.rail.addEventListener(
			"mouseleave",
			(event: MouseEvent): void =>
			{
				event.preventDefault();
				this.dragEnd();
			},
			{
				signal: this.beingDraggedRemote.signal
			}
		);
	}

	private dragUpdate(mouse_position: number): void
	{
		if (this.beingDraggedRemote !== null)
		{
			this.skipNextAutoplay = true;
			const OFFSET_DELTA: number = mouse_position - this.dragStartingPoint;
			this.rail.style.left = this.toPixel(this.currentOffset + OFFSET_DELTA);
		}
	}

	private dragEnd(): void
	{
		if (this.beingDraggedRemote === null)
		{
			return;
		}

		this.rail.style.transition = "";
		this.beingDraggedRemote.abort();
		this.beingDraggedRemote = null;
		this.touchId = 0;

		const THRESHOLD: number = this.computeViewportLeft();

		const LAST_INDEX: number = this.slides.length - 1;
		let new_index: number = LAST_INDEX;

		for (let index = 0; index < LAST_INDEX; ++index)
		{
			if (index < new_index)
			{
				const LEFT: number = this.computeSlideLeft(index);

				if (THRESHOLD <= LEFT)
				{
					new_index = index;
				}
			}
		}

		this.activeIndex = new_index;
		this.slideTransition();
	}

	private findTouch(touches: TouchList): Touch|undefined
	{
		if (this.touchId === 0)
		{
			return undefined;
		}

		return Array.from(touches).find(
			(touch: Touch): boolean =>
			{
				return touch.identifier === this.touchId;
			}
		);
	}

	private toPixel(width: number): string
	{
		return `${width.toFixed(0)}px`;
	}
}

customElements.define(ElementName.container, SimpleSlideshow);

export {
	AnimationName,
	OrientationName,
	ElementName,
	ClassName,
	ElementSelector,
	ArrowBuilder,
	BulletBuilder,
	Configuration,
	SimpleSlideshow
};
