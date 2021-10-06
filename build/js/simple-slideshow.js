class SimpleSlideshow extends HTMLElement {
    viewport;
    rail;
    nav;
    slides = [];
    bullets = [];
    animation;
    fullWidthSlide = false;
    showArrows = false;
    showBullets = false;
    skipNextAutoplay = false;
    activeIndex = 0;
    dragStartingPoint = 0;
    currentOffset = 0;
    autoplayId = 0;
    resizeId = 0;
    touchId = 0;
    beingDraggedRemote = null;
    draggableRemote = null;
    constructor() {
        super();
        this.viewport = this.initializeViewport();
        this.rail = this.initializeRail();
        this.nav = this.initializeNav();
    }
    initialize(configuration) {
        this.initializeSlides(configuration);
        this.setFullWidthSlide(configuration.fullWidthSlide ?? true);
        this.changeAnimation(configuration.animation ?? "slide");
        if (configuration.addArrows ?? false) {
            this.addArrows(configuration.arrowBuilder);
        }
        if (configuration.addBullets ?? false) {
            this.addBullets(configuration.bulletBuilder);
        }
        if (this.animation === "slide") {
            if (configuration.draggable ?? true) {
                this.enableDragging();
            }
        }
        else if (configuration.draggable === true) {
            throw new Error("Unable to enable dragging if animation is not set to slide");
        }
        if (configuration.autoplayDelay !== undefined) {
            this.startAutoplay(configuration.autoplayDelay);
        }
        window.addEventListener("resize", () => {
            if (this.resizeId > 0) {
                clearTimeout(this.resizeId);
            }
            this.resizeId = setTimeout(() => {
                this.refresh();
            }, 500);
        });
    }
    changeAnimation(animation) {
        if (this.animation === animation) {
            return;
        }
        if (this.animation !== undefined) {
            this.classList.remove(this.animation);
        }
        this.animation = animation;
        this.classList.add(animation);
        if (animation === "slide") {
            this.enableDragging();
        }
        else {
            this.rail.style.left = "";
            this.disableDragging();
        }
    }
    setFullWidthSlide(flag) {
        if (this.fullWidthSlide === flag) {
            return;
        }
        this.fullWidthSlide = flag;
        if (flag) {
            const WIDTH = this.toPixel(this.computeViewportWidth());
            this.slides.forEach((slide) => {
                slide.style.width = WIDTH;
            });
        }
        else {
            this.slides.forEach((slide) => {
                slide.style.width = "";
            });
        }
    }
    addArrows(generator) {
        if (this.showArrows) {
            this.removeArrows();
        }
        this.showArrows = true;
        const LEFT_ARROW = document.createElement("button");
        const RIGHT_ARROW = document.createElement("button");
        if (generator !== undefined) {
            LEFT_ARROW.append(generator("left"));
            RIGHT_ARROW.append(generator("right"));
        }
        this.append(LEFT_ARROW);
        this.append(RIGHT_ARROW);
        LEFT_ARROW.classList.add("slideshow-arrow", "left");
        RIGHT_ARROW.classList.add("slideshow-arrow", "right");
        LEFT_ARROW.addEventListener("click", () => {
            this.previousSlide();
        });
        RIGHT_ARROW.addEventListener("click", () => {
            this.nextSlide();
        });
    }
    removeArrows() {
        if (!this.showArrows) {
            return;
        }
        this.showArrows = false;
        this.querySelectorAll("button.slideshow-arrow").forEach((arrow) => {
            arrow.remove();
        });
    }
    addBullets(generator) {
        if (this.showBullets) {
            this.removeBullets();
        }
        this.showBullets = true;
        const LENGTH = this.slides.length;
        for (let index = 0; index < LENGTH; ++index) {
            const BULLET = document.createElement("button");
            BULLET.classList.add("slideshow-bullet");
            BULLET.classList.toggle("active", index === this.activeIndex);
            this.nav.append(BULLET);
            this.bullets.push(BULLET);
            if (generator === undefined) {
                BULLET.textContent = (index + 1).toFixed(0);
            }
            else {
                BULLET.append(generator(index));
            }
            BULLET.addEventListener("click", () => {
                this.changeSlide(index);
            });
        }
        this.append(this.nav);
    }
    removeBullets() {
        if (!this.showBullets) {
            return;
        }
        this.showBullets = false;
        this.bullets.forEach((bullet) => {
            bullet.remove();
        });
        this.bullets = [];
        this.nav.remove();
    }
    nextSlide() {
        ++this.activeIndex;
        if (this.activeIndex >= this.slides.length) {
            this.activeIndex = 0;
        }
        this.slideTransition();
    }
    previousSlide() {
        if (this.activeIndex > 0) {
            --this.activeIndex;
        }
        else {
            this.activeIndex = this.slides.length - 1;
        }
        this.slideTransition();
    }
    changeSlide(index) {
        if (index < 0 || this.slides.length <= index) {
            throw new Error("Out of bound index");
        }
        this.activeIndex = index;
        this.slideTransition();
    }
    enableDragging() {
        if (this.animation !== "slide") {
            throw new Error("Requires a slide animation to enable dragging");
        }
        if (this.draggableRemote !== null) {
            return;
        }
        this.draggableRemote = new AbortController();
        this.rail.addEventListener("touchstart", (event) => {
            event.preventDefault();
            if (this.touchId !== 0) {
                return;
            }
            const TOUCH = event.changedTouches[0];
            if (TOUCH instanceof Touch) {
                this.touchId = TOUCH.identifier;
                this.dragStart(TOUCH.clientX);
            }
            else {
                throw new Error("Empty TouchList");
            }
        }, {
            signal: this.draggableRemote.signal
        });
        this.rail.addEventListener("mousedown", (event) => {
            event.preventDefault();
            this.dragStart(event.clientX);
        }, {
            signal: this.draggableRemote.signal
        });
    }
    disableDragging() {
        if (this.draggableRemote === null) {
            return;
        }
        this.dragEnd();
        this.draggableRemote.abort();
        this.draggableRemote = null;
    }
    startAutoplay(delay) {
        if (!Number.isSafeInteger(delay) || delay < 1) {
            throw new Error("Autoplay delay must be a safe positive integer");
        }
        this.stopAutoplay();
        this.skipNextAutoplay = false;
        this.autoplayId = setInterval(() => {
            if (!this.skipNextAutoplay) {
                this.nextSlide();
            }
            this.skipNextAutoplay = false;
        }, delay);
    }
    stopAutoplay() {
        if (this.autoplayId !== 0) {
            clearInterval(this.autoplayId);
            this.autoplayId = 0;
        }
    }
    refresh() {
        if (this.resizeId > 0) {
            clearTimeout(this.resizeId);
            this.resizeId = 0;
        }
        const WIDTH = this.toPixel(this.computeViewportWidth());
        if (this.fullWidthSlide) {
            this.slides.forEach((slide) => {
                slide.style.setProperty("width", WIDTH);
            });
        }
        this.updateRailWidth();
        if (this.animation === "slide") {
            this.slideTransition();
        }
    }
    initializeViewport() {
        let viewport = this.querySelector("slideshow-viewport");
        if (viewport === null) {
            viewport = document.createElement("slideshow-viewport");
            this.append(viewport);
        }
        return viewport;
    }
    initializeRail() {
        let rail = this.querySelector("slideshow-rail");
        if (rail === null) {
            rail = document.createElement("slideshow-rail");
            this.viewport.append(rail);
        }
        return rail;
    }
    initializeNav() {
        let nav = this.querySelector("slideshow-bullets");
        if (nav === null) {
            nav = document.createElement("slideshow-bullets");
        }
        else {
            nav.remove();
        }
        return nav;
    }
    initializeSlides(configuration) {
        const ELEMENTS = this.extractElements(configuration);
        const WIDTH = this.toPixel(this.computeViewportWidth());
        ELEMENTS.forEach((element) => {
            const SLIDE = document.createElement("slideshow-slide");
            SLIDE.append(element);
            if (this.fullWidthSlide) {
                SLIDE.style.width = WIDTH;
            }
            this.rail.append(SLIDE);
            this.slides.push(SLIDE);
        });
        this.updateRailWidth();
    }
    extractElements(configuration) {
        const ELEMENTS = [];
        function add(element) {
            if (element instanceof HTMLElement) {
                ELEMENTS.push(element);
            }
        }
        if (configuration.elements !== undefined) {
            configuration.elements.forEach(add);
        }
        else if (configuration.elementsSelector !== undefined) {
            this.querySelectorAll(configuration.elementsSelector).forEach(add);
        }
        else {
            this.querySelectorAll("[data-slide]").forEach(add);
        }
        return ELEMENTS;
    }
    slideTransition() {
        this.skipNextAutoplay = true;
        this.updateActive();
        if (this.animation === "slide") {
            const SLIDE_OFFSET = this.computeSlideLeft(this.activeIndex);
            const RAIL_OFFSET = this.computeRailLeft();
            this.currentOffset = RAIL_OFFSET - SLIDE_OFFSET;
            this.rail.style.left = this.toPixel(this.currentOffset);
        }
    }
    updateActive() {
        this.slides.forEach((slide, index) => {
            slide.classList.toggle("active", this.activeIndex === index);
        });
        this.bullets.forEach((bullet, index) => {
            bullet.classList.toggle("active", this.activeIndex === index);
        });
    }
    computeViewportWidth() {
        return this.viewport.getBoundingClientRect().width;
    }
    computeViewportLeft() {
        return this.viewport.getBoundingClientRect().left;
    }
    computeRailLeft() {
        return this.rail.getBoundingClientRect().left;
    }
    computeSlideLeft(index) {
        const SLIDE = this.slides[index];
        if (SLIDE === null) {
            throw new Error("No slide matching index");
        }
        return SLIDE.getBoundingClientRect().left;
    }
    updateRailWidth() {
        let width = this.computeViewportWidth();
        if (this.animation === "slide") {
            width *= this.slides.length + 4000;
        }
        this.rail.style.width = this.toPixel(width);
    }
    dragStart(mouse_position) {
        if (this.beingDraggedRemote !== null) {
            return;
        }
        this.rail.style.transition = "all 0s linear 0s";
        this.dragStartingPoint = mouse_position;
        this.beingDraggedRemote = new AbortController();
        window.addEventListener("touchmove", (event) => {
            event.preventDefault();
            const TOUCH = this.findTouch(event.changedTouches);
            if (TOUCH instanceof Touch) {
                this.dragUpdate(TOUCH.clientX);
            }
        }, {
            signal: this.beingDraggedRemote.signal
        });
        window.addEventListener("touchend", (event) => {
            event.preventDefault();
            const TOUCH = this.findTouch(event.changedTouches);
            if (TOUCH instanceof Touch) {
                this.dragEnd();
            }
        }, {
            signal: this.beingDraggedRemote.signal
        });
        this.rail.addEventListener("mousemove", (event) => {
            event.preventDefault();
            this.dragUpdate(event.clientX);
        }, {
            signal: this.beingDraggedRemote.signal
        });
        this.rail.addEventListener("mouseup", (event) => {
            event.preventDefault();
            this.dragEnd();
        }, {
            signal: this.beingDraggedRemote.signal
        });
        this.rail.addEventListener("mouseleave", (event) => {
            event.preventDefault();
            this.dragEnd();
        }, {
            signal: this.beingDraggedRemote.signal
        });
    }
    dragUpdate(mouse_position) {
        if (this.beingDraggedRemote !== null) {
            this.skipNextAutoplay = true;
            const OFFSET_DELTA = mouse_position - this.dragStartingPoint;
            this.rail.style.left = this.toPixel(this.currentOffset + OFFSET_DELTA);
        }
    }
    dragEnd() {
        if (this.beingDraggedRemote === null) {
            return;
        }
        this.rail.style.transition = "";
        this.beingDraggedRemote.abort();
        this.beingDraggedRemote = null;
        this.touchId = 0;
        const THRESHOLD = this.computeViewportLeft();
        const LAST_INDEX = this.slides.length - 1;
        let new_index = LAST_INDEX;
        for (let index = 0; index < LAST_INDEX; ++index) {
            if (index < new_index) {
                const LEFT = this.computeSlideLeft(index);
                if (THRESHOLD <= LEFT) {
                    new_index = index;
                }
            }
        }
        this.activeIndex = new_index;
        this.slideTransition();
    }
    findTouch(touches) {
        if (this.touchId === 0) {
            return undefined;
        }
        return Array.from(touches).find((touch) => {
            return touch.identifier === this.touchId;
        });
    }
    toPixel(width) {
        return `${width.toFixed(0)}px`;
    }
}
customElements.define("simple-slideshow", SimpleSlideshow);
export { SimpleSlideshow };
