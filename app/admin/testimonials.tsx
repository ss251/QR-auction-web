"use client";

import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "wagmi";
import { Trash2, Loader2, Star, StarOff } from "lucide-react";
import { toast } from "sonner";
import { TwitterEmbed } from "@/components/TwitterEmbed";
import { FarcasterEmbed } from "react-farcaster-embed/dist/client";
import "react-farcaster-embed/dist/styles.css";

interface Testimonial {
  id: number;
  url: string;
  type: "warpcast" | "twitter";
  author?: string;
  content?: string;
  is_approved: boolean;
  is_featured: boolean;
  carousel?: boolean;
  created_at: string;
  updated_at: string;
  priority: number;
}

interface LoadingStates {
  [key: string]: boolean;
}

export function TestimonialsAdmin() {
  const { address } = useAccount();
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [newUrl, setNewUrl] = useState("");
  const [newType, setNewType] = useState<"warpcast" | "twitter">("warpcast");
  const [addingNew, setAddingNew] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Track loading state per testimonial and action
  const [loadingStates, setLoadingStates] = useState<LoadingStates>({});
  // Track which testimonial is being edited for priority and its value
  const [editingPriorityId, setEditingPriorityId] = useState<number | null>(
    null
  );
  const [priorityInputValue, setPriorityInputValue] = useState<string>("");

  // Automatically set newType based on newUrl
  useEffect(() => {
    if (newUrl.includes("twitter.com") || newUrl.includes("x.com")) {
      setNewType("twitter");
    } else {
      setNewType("warpcast");
    }
  }, [newUrl]);

  const fetchTestimonials = useCallback(async () => {
    if (!address) return;

    try {
      setPageLoading(true);

      const response = await fetch("/api/admin/testimonials", {
        headers: {
          Authorization: `Bearer ${address}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.status}`);
      }

      const data = await response.json();
      setTestimonials(data.testimonials || []);
    } catch (error) {
      console.error("Error fetching testimonials:", error);
      toast.error("Failed to load testimonials");
    } finally {
      setPageLoading(false);
    }
  }, [address]);

  useEffect(() => {
    if (address) {
      fetchTestimonials();
    }
  }, [refreshKey, address, fetchTestimonials]);

  const addTestimonial = async () => {
    if (!newUrl) {
      toast.error("URL is required");
      return;
    }

    if (!address) {
      toast.error("Wallet not connected");
      return;
    }

    try {
      setAddingNew(true);

      const response = await fetch("/api/admin/testimonials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${address}`,
        },
        body: JSON.stringify({
          url: newUrl,
          type: newType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to add: ${response.status}`);
      }

      toast.success("Testimonial added successfully");
      setNewUrl("");
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error adding testimonial:", error);
      toast.error("Failed to add testimonial");
    } finally {
      setAddingNew(false);
    }
  };

  const updateTestimonial = async (
    id: number,
    updates: Partial<Testimonial>,
    actionType: string
  ) => {
    if (!address) {
      toast.error("Wallet not connected");
      return;
    }

    const loadingKey = `${id}-${actionType}`;

    try {
      // Set loading state for this specific operation
      setLoadingStates((prev) => ({ ...prev, [loadingKey]: true }));

      const response = await fetch("/api/admin/testimonials", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${address}`,
        },
        body: JSON.stringify({
          id,
          updates,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to update: ${response.status}`);
      }

      toast.success("Testimonial updated");
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error updating testimonial:", error);
      toast.error("Failed to update testimonial");
    } finally {
      // Clear loading state for this specific operation
      setLoadingStates((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  const deleteTestimonial = async (id: number) => {
    if (!address) {
      toast.error("Wallet not connected");
      return;
    }

    const loadingKey = `${id}-delete`;

    try {
      // Set loading state for this specific delete operation
      setLoadingStates((prev) => ({ ...prev, [loadingKey]: true }));

      const response = await fetch(`/api/admin/testimonials?id=${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${address}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: ${response.status}`);
      }

      toast.success("Testimonial deleted");
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error("Error deleting testimonial:", error);
      toast.error("Failed to delete testimonial");
    } finally {
      // Clear loading state
      setLoadingStates((prev) => ({ ...prev, [loadingKey]: false }));
    }
  };

  /*   const toggleFeatured = async (id: number, currentValue: boolean) => {
    await updateTestimonial(id, { is_featured: !currentValue }, 'feature');
  }; */

  const toggleCarousel = async (id: number, currentValue: boolean) => {
    await updateTestimonial(id, { carousel: !currentValue }, "carousel");
  };

  // Helper to check loading state for a specific action
  const isLoading = (id: number, actionType: string) => {
    return !!loadingStates[`${id}-${actionType}`];
  };

  // New: handle priority edit submit
  const submitPriorityEdit = async (testimonial: Testimonial) => {
    const newPriority = parseInt(priorityInputValue, 10);
    if (
      isNaN(newPriority) ||
      newPriority < 0 ||
      newPriority === testimonial.priority ||
      isLoading(testimonial.id, "priorityEdit")
    ) {
      // Invalid or unchanged
      setEditingPriorityId(null);
      setPriorityInputValue("");
      return;
    }
    // Optionally, you can check for max allowed priority here
    await updateTestimonial(
      testimonial.id,
      { priority: newPriority },
      "priorityEdit"
    );
    setEditingPriorityId(null);
    setPriorityInputValue("");
  };

  // Show loading if no address yet
  if (!address) {
    return (
      <div className="flex justify-center my-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto mb-2" />
          <p className="text-gray-500">Please connect your wallet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4">Add New Testimonial</h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-3">
            <Input
              placeholder="Enter URL (Twitter or Warpcast)"
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value)}
              className="flex-grow"
            />
            {/* Show detected type to user */}
            <div className="flex items-center w-20 shrink-0 overflow-hidden justify-center text-sm text-gray-500">
              <span className="ml-1 font-semibold">
                {newType === "twitter" ? "Twitter" : "Warpcast"}
              </span>
            </div>
            <Button onClick={addTestimonial} disabled={addingNew}>
              {addingNew ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                "ADD"
              )}
            </Button>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold">Manage Testimonials</h2>
          <span className="text-xs text-gray-500 italic">
            Note: IDs increment sequentially even after deletions
          </span>
        </div>

        {pageLoading ? (
          <div className="flex justify-center my-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
          </div>
        ) : testimonials.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No testimonials found</p>
          </div>
        ) : (
          testimonials.map((testimonial) => (
            <Card key={testimonial.id} className="p-4 w-full">
              <div className="mb-3 flex flex-wrap gap-2 justify-between items-center">
                <div className="flex items-center space-x-2">
                  <span className="font-medium">ID: {testimonial.id}</span>
                  <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                    {testimonial.type === "warpcast" ? "Warpcast" : "Twitter"}
                  </span>

                  <span
                    className="text-sm font-bold border border-blue-400 rounded px-1 text-blue-500 cursor-pointer select-none min-w-[106px] h-8 flex items-center justify-center"
                    onClick={() => {
                      setEditingPriorityId(testimonial.id);
                      setPriorityInputValue(testimonial.priority.toString());
                    }}
                  >
                    {editingPriorityId === testimonial.id ? (
                      <input
                        type="number"
                        min={0}
                        className="w-24 px-1.5 py-0.5 text-blue-500"
                        value={priorityInputValue}
                        autoFocus
                        disabled={isLoading(testimonial.id, "priorityEdit")}
                        onChange={(e) => {
                          // Only allow numbers
                          const val = e.target.value;
                          if (/^\d*$/.test(val)) setPriorityInputValue(val);
                        }}
                        onBlur={() => submitPriorityEdit(testimonial)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            submitPriorityEdit(testimonial);
                          } else if (e.key === "Escape") {
                            setEditingPriorityId(null);
                            setPriorityInputValue("");
                          }
                        }}
                      />
                    ) : (
                      <>
                        Priority: {testimonial.priority}
                        {isLoading(testimonial.id, "priorityEdit") && (
                          <Loader2 className="inline ml-1 h-4 w-4 animate-spin align-middle" />
                        )}
                      </>
                    )}
                  </span>

                  {/*  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => changePriority(testimonial.id, testimonial.priority, 1)}
                    disabled={isLoading(testimonial.id, 'upPriority') || isLoading(testimonial.id, 'downPriority')}
                  >
                    {isLoading(testimonial.id, 'upPriority') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowUpCircle className="h-4 w-4" />
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => changePriority(testimonial.id, testimonial.priority, -1)}
                    disabled={isLoading(testimonial.id, 'downPriority') || isLoading(testimonial.id, 'upPriority')}
                  >
                    {isLoading(testimonial.id, 'downPriority') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4" />
                    )}
                  </Button> */}
                </div>

                <div className="flex items-center gap-2">
                  {/*  <Button 
                    variant={testimonial.is_featured ? "secondary" : "outline"} 
                    size="sm" 
                    onClick={() => toggleFeatured(testimonial.id, testimonial.is_featured)}
                    disabled={isLoading(testimonial.id, 'feature')}
                  >
                    {isLoading(testimonial.id, 'feature') ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : testimonial.is_featured ? (
                      <Star className="h-4 w-4" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button> */}

                  <Button
                    variant={testimonial.carousel ? "outline" : "outline"}
                    size="sm"
                    onClick={() =>
                      toggleCarousel(
                        testimonial.id,
                        testimonial.carousel || false
                      )
                    }
                    disabled={isLoading(testimonial.id, "carousel")}
                    title={
                      testimonial.carousel
                        ? "Remove from carousel"
                        : "Add to carousel"
                    }
                  >
                    {isLoading(testimonial.id, "carousel") ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : testimonial.carousel ? (
                      <Star className="h-4 w-4" />
                    ) : (
                      <StarOff className="h-4 w-4" />
                    )}
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteTestimonial(testimonial.id)}
                    disabled={isLoading(testimonial.id, "delete")}
                  >
                    {isLoading(testimonial.id, "delete") ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col items-center">
                <a
                  href={testimonial.url}
                  className="text-sm text-center font-medium text-blue-500 mb-2 break-all w-full underline"
                  target="_blank"
                >
                  {" "}
                  {testimonial.url}
                </a>
                <div className="max-w-xl w-full">
                  {testimonial.type === "warpcast" ? (
                    <FarcasterEmbed url={testimonial.url} />
                  ) : (
                    <TwitterEmbed tweetUrl={testimonial.url} />
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
