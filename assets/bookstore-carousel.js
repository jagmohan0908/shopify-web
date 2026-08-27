class BookstoreCarousel extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-carousel-track]');
    this.slides = Array.from(this.querySelectorAll('[data-carousel-slide]'));
    const controlScope = this.closest('.rk-shelf') || this;
    this.previousButton = this.querySelector('[data-carousel-previous]') || controlScope.querySelector('[data-carousel-previous]');
    this.nextButton = this.querySelector('[data-carousel-next]') || controlScope.querySelector('[data-carousel-next]');
    this.dots = Array.from(this.querySelectorAll('[data-carousel-dot]'));

    if (!this.track || this.slides.length < 1) return;

    this.previousButton?.addEventListener('click', this.previous);
    this.nextButton?.addEventListener('click', this.next);
    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    this.addEventListener('mouseenter', this.pause);
    this.addEventListener('mouseleave', this.play);
    this.addEventListener('focusin', this.pause);
    this.addEventListener('focusout', this.play);

    this.dots.forEach((dot, index) => {
      dot.addEventListener('click', () => this.goTo(index));
    });

    this.update();
    this.play();
  }

  disconnectedCallback() {
    this.previousButton?.removeEventListener('click', this.previous);
    this.nextButton?.removeEventListener('click', this.next);
    this.track?.removeEventListener('scroll', this.onScroll);
    this.removeEventListener('mouseenter', this.pause);
    this.removeEventListener('mouseleave', this.play);
    this.removeEventListener('focusin', this.pause);
    this.removeEventListener('focusout', this.play);
    this.pause();
  }

  get step() {
    if (!this.track || !this.slides[0]) return 0;
    const styles = getComputedStyle(this.track);
    const parsedGap = Number.parseFloat(styles.columnGap || styles.gap || '0');
    const gap = Number.isFinite(parsedGap) ? parsedGap : 0;
    return this.slides[0].getBoundingClientRect().width + gap;
  }

  get index() {
    if (!this.track || this.step === 0) return 0;
    return Math.max(0, Math.min(this.slides.length - 1, Math.round(this.track.scrollLeft / this.step)));
  }

  previous = () => {
    if (!this.track) return;
    this.track.scrollBy({ left: -this.step, behavior: 'smooth' });
  };

  next = () => {
    if (!this.track) return;
    const atEnd = this.track.scrollLeft + this.track.clientWidth >= this.track.scrollWidth - 4;

    if (atEnd && this.hasAttribute('data-autoplay')) {
      this.track.scrollTo({ left: 0, behavior: 'smooth' });
      return;
    }

    this.track.scrollBy({ left: this.step, behavior: 'smooth' });
  };

  goTo(index) {
    if (!this.track) return;
    this.track.scrollTo({ left: this.step * index, behavior: 'smooth' });
  }

  onScroll = () => {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.update());
  };

  update() {
    if (!this.track) return;
    const atStart = this.track.scrollLeft <= 4;
    const atEnd = this.track.scrollLeft + this.track.clientWidth >= this.track.scrollWidth - 4;

    if (this.previousButton) this.previousButton.disabled = atStart;
    if (this.nextButton && !this.hasAttribute('data-autoplay')) this.nextButton.disabled = atEnd;

    this.dots.forEach((dot, dotIndex) => {
      const isActive = dotIndex === this.index;
      dot.toggleAttribute('aria-current', isActive);
      dot.setAttribute('aria-label', `Go to slide ${dotIndex + 1}`);
    });
  }

  play = () => {
    this.pause();
    const delay = Number(this.dataset.autoplay);
    if (!delay || this.slides.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.timer = window.setInterval(this.next, delay);
  };

  pause = () => {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
  };
}

if (!customElements.get('bookstore-carousel')) {
  customElements.define('bookstore-carousel', BookstoreCarousel);
}
