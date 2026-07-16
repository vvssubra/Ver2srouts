import { useEffect, useMemo, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info, GraduationCap, Sparkles, AlertTriangle, CheckCircle2, ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChildSummary {
  first_name: string;
  last_name: string;
  gender?: string | null;
  className?: string | null;
}

export interface FeeSummary {
  outstanding: number;
  overdue: number;
  nextDue?: { due_date: string } | null;
}

interface Props {
  child: ChildSummary;
  feeSummary?: FeeSummary | null;
  totalAssessed: number;
  totalStandards: number;
  areasCount: number;
}

/**
 * Two-slide hero carousel for the Parent app.
 * - Slide A: Child summary (avatar, name, class, skills assessed).
 * - Slide B: Fees overview with CTA to /parent-fees.
 * Auto-prioritizes the Fees slide on first view of the day when there is
 * an overdue or outstanding balance.
 */
export default function ParentHeroCarousel({ child, feeSummary, totalAssessed, totalStandards, areasCount }: Props) {
  const navigate = useNavigate();
  const hasFees = !!feeSummary;
  const needsAttention = !!feeSummary && (feeSummary.overdue > 0 || feeSummary.outstanding > 0);

  // Default slide: Fees while any balance is outstanding/overdue, otherwise Child.
  // No localStorage gating — the Fees slide must keep showing as the default
  // until the payment is actually cleared.
  const initialIndex = useMemo(() => (hasFees && needsAttention ? 1 : 0), [hasFees, needsAttention]);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: "start",
    startIndex: initialIndex,
    dragFree: false,
    skipSnaps: false,
    duration: 22,
  });
  const [selected, setSelected] = useState(initialIndex);

  // Re-pin to the priority slide whenever the priority changes (e.g. fees update).
  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.scrollTo(initialIndex, true);
  }, [emblaApi, initialIndex]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => setSelected(emblaApi.selectedScrollSnap());
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  const slides = [
    <ChildSlide
      key="child"
      child={child}
      totalAssessed={totalAssessed}
      totalStandards={totalStandards}
      areasCount={areasCount}
    />,
    ...(hasFees ? [<FeesSlide key="fees" feeSummary={feeSummary!} onOpen={() => navigate("/parent-fees")} />] : []),
  ];

  return (
    <div className="relative">
      <div
        className="overflow-hidden rounded-2xl touch-pan-y"
        ref={emblaRef}
      >
        <div className="flex items-stretch">
          {slides.map((slide, i) => (
            <div key={i} className="min-w-0 flex-[0_0_100%]">
              <div className="h-full">{slide}</div>
            </div>
          ))}
        </div>
      </div>

      {slides.length > 1 && (
        <>
          {/* Arrows on >= md */}
          <button
            type="button"
            aria-label="Previous"
            onClick={() => emblaApi?.scrollPrev()}
            className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-background/95 backdrop-blur shadow-md border hover:bg-background transition disabled:opacity-0"
            disabled={selected === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next"
            onClick={() => emblaApi?.scrollNext()}
            className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-full bg-background/95 backdrop-blur shadow-md border hover:bg-background transition disabled:opacity-0"
            disabled={selected === slides.length - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          {/* Sleek horizontal pagination — active expands into a slim pill. */}
          <div
            className="mt-2.5 mb-1 flex items-center justify-center gap-1.5"
            role="tablist"
            aria-label={`Slide ${selected + 1} of ${slides.length}`}
          >
            {slides.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={selected === i}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => emblaApi?.scrollTo(i)}
                className="py-2 -my-2 group"
              >
                <span
                  className={cn(
                    "block h-1.5 rounded-full transition-all duration-300 ease-out",
                    selected === i
                      ? "w-5 bg-primary"
                      : "w-1.5 bg-foreground/20 group-hover:bg-foreground/30"
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChildSlide({ child, totalAssessed, totalStandards, areasCount }: { child: ChildSummary; totalAssessed: number; totalStandards: number; areasCount: number }) {
  const pct = totalStandards > 0 ? (totalAssessed / totalStandards) * 100 : 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card p-4 sm:p-5 shadow-sm h-full min-h-[180px] sm:min-h-[200px] flex flex-col">
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl pointer-events-none" />

      {/* Header: avatar + name + class */}
      <div className="relative flex items-center gap-3 sm:gap-4">
        <div className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-bold text-lg sm:text-xl shrink-0 shadow-sm">
          {child.first_name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground text-base sm:text-lg truncate">
            {child.first_name} {child.last_name}
          </h2>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs font-normal">
              <GraduationCap className="h-3 w-3" />
              {child.className || "No class assigned"}
            </Badge>
            {child.gender && (
              <Badge variant="outline" className="text-[10px] sm:text-xs font-normal capitalize">
                {child.gender}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Integrated skills progress block */}
      <div className="relative mt-auto pt-4 sm:pt-5">
        <div className="flex items-end justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-[11px] sm:text-xs font-medium text-foreground/80 truncate">
              Skills assessed
            </span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label="What does this mean?" className="text-muted-foreground hover:text-foreground shrink-0">
                    <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs">
                  We track {totalStandards} learning standards across {areasCount} development areas. So far the teacher has formally assessed {totalAssessed}.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <div className="flex items-baseline gap-1 shrink-0">
            <span className="text-lg sm:text-xl font-bold text-primary tabular-nums leading-none">{totalAssessed}</span>
            <span className="text-[11px] text-muted-foreground tabular-nums">/ {totalStandards}</span>
          </div>
        </div>
        <Progress value={pct} className="h-2" />
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {Math.round(pct)}% of standards observed across {areasCount} development areas
        </p>
      </div>
    </div>
  );
}

function FeesSlide({ feeSummary, onOpen }: { feeSummary: FeeSummary; onOpen: () => void }) {
  const overdue = feeSummary.overdue > 0;
  const outstanding = feeSummary.outstanding > 0;
  const allPaid = !overdue && !outstanding;

  const tone = overdue
    ? "from-destructive/15 via-card to-card border-destructive/30"
    : outstanding
    ? "from-warning/15 via-card to-card border-warning/30"
    : "from-success/15 via-card to-card border-success/30";

  return (
    <div className={cn("relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow h-full min-h-[180px] sm:min-h-[200px] flex flex-col", tone)}>
      <div className="absolute -top-10 -right-10 h-32 w-32 rounded-full blur-2xl pointer-events-none bg-foreground/[0.04]" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {overdue ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : allPaid ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-warning" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Fees Overview
          </span>
        </div>
        {overdue && (
          <Badge variant="destructive" className="text-[10px]">Action needed</Badge>
        )}
      </div>

      <div className="relative mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <p className={cn("text-xl sm:text-2xl font-bold tabular-nums", outstanding ? (overdue ? "text-destructive" : "text-warning") : "text-success")}>
            RM{feeSummary.outstanding.toFixed(0)}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Outstanding</p>
        </div>
        <div>
          <p className={cn("text-xl sm:text-2xl font-bold tabular-nums", overdue ? "text-destructive" : "text-foreground")}>
            {feeSummary.overdue}
          </p>
          <p className={cn("text-[10px] sm:text-xs mt-0.5", overdue ? "text-destructive" : "text-muted-foreground")}>
            Overdue
          </p>
        </div>
        <div>
          {feeSummary.nextDue ? (
            <>
              <p className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
                {format(new Date(feeSummary.nextDue.due_date), "d MMM")}
              </p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">Next Due</p>
            </>
          ) : (
            <>
              <p className="text-xl sm:text-2xl font-bold text-success">✓</p>
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">All Paid</p>
            </>
          )}
        </div>
      </div>

      <div className="relative mt-auto pt-3 flex justify-end">
        <Button
          size="sm"
          variant={overdue ? "destructive" : "default"}
          className="h-8 text-xs"
          onClick={(e) => { e.stopPropagation(); onOpen(); }}
        >
          {overdue ? "Pay now" : outstanding ? "View invoices" : "View history"}
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}