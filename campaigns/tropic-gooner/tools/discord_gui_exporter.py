import discord
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox, simpledialog, filedialog
import asyncio
import threading
import os
import re
from datetime import datetime
import queue # Using queue for thread-safe communication

# --- Configuration ---
# It's better to use environment variables or a config file for the token
# For simplicity here, we'll ask the user via the GUI on first run if not set.
BOT_TOKEN = None 
# Example: BOT_TOKEN = "YOUR_VERY_SECRET_BOT_TOKEN" 

# --- Global Variables ---
intents = discord.Intents.default()
intents.guilds = True
intents.messages = True
intents.message_content = True # Requires verification + enabling in Developer Portal
intents.members = True # Required for author details sometimes, enable in portal

client = discord.Client(intents=intents)
loop = asyncio.get_event_loop()
discord_thread = None
root = None # Tkinter main window
gui_queue = queue.Queue() # Queue for Discord -> GUI communication

# Data storage
guild_data = {} # {guild_id: guild_name}
channel_data = {} # {guild_id: {channel_id: channel_name}}
thread_data = {} # {channel_id: {thread_id: thread_name}}

# --- Discord Logic (runs in a separate thread) ---

async def fetch_guilds():
    """Fetches guilds the bot is in."""
    guilds = {}
    await client.wait_until_ready()
    for guild in client.guilds:
        guilds[guild.id] = guild.name
    # Put result into the GUI queue
    gui_queue.put(("update_guilds", guilds))

async def fetch_channels(guild_id):
    """Fetches text channels for a specific guild."""
    channels = {}
    try:
        guild = client.get_guild(int(guild_id))
        if guild:
            # Fetch active and archived public threads too for initial listing
            # Note: fetching all threads might be slow/intensive
            # You might want separate logic just for active threads if needed
            all_threads = []
            try:
                # Fetch active threads in channels we can see
                 for channel in guild.text_channels:
                     try:
                         active = await channel.active_threads()
                         all_threads.extend(active)
                     except discord.Forbidden:
                         print(f"Warning: Cannot access threads in channel {channel.name} ({channel.id})")
                     except Exception as e:
                         print(f"Error fetching active threads for {channel.name}: {e}")

                 # Fetch archived public threads (might require more permissions/intents)
                 # This can be slow! Consider adding limits or user options.
                 # archived = await guild.active_threads() # Fetches active, need archived
                 # public_archived = await guild.fetch_archived_threads(private=False, limit=None) # Might timeout
                 # all_threads.extend(public_archived)
                 pass # Skipping archived for simplicity/performance for now

            except discord.Forbidden:
                 print(f"Warning: Bot lacks permissions to fetch threads in guild {guild.name}")
            except Exception as e:
                 print(f"Error fetching threads for guild {guild.name}: {e}")


            # Store channels and their associated threads
            temp_channel_data = {}
            temp_thread_data = {}
            for channel in guild.text_channels:
                 temp_channel_data[channel.id] = channel.name
                 temp_thread_data[channel.id] = {} # Init thread dict for this channel

            for thread in all_threads:
                if thread.parent_id in temp_channel_data: # Check if parent channel is known
                     temp_thread_data[thread.parent_id][thread.id] = thread.name

            gui_queue.put(("update_channels", (guild_id, temp_channel_data, temp_thread_data)))
        else:
            gui_queue.put(("status_update", f"Error: Guild with ID {guild_id} not found."))
    except Exception as e:
        gui_queue.put(("status_update", f"Error fetching channels: {e}"))

async def fetch_messages_from_threads(thread_ids, output_dir):
    """Fetches messages from selected threads and saves them."""
    all_messages = []
    processed_count = 0
    total_to_process = len(thread_ids)

    gui_queue.put(("status_update", f"Starting message fetch for {total_to_process} thread(s)..."))

    for thread_id in thread_ids:
        processed_count += 1
        gui_queue.put(("status_update", f"Processing thread {processed_count}/{total_to_process} (ID: {thread_id})..."))
        try:
            # Try fetching as a thread directly
            thread = client.get_channel(int(thread_id))
            if not isinstance(thread, discord.Thread):
                 # Maybe it's an ID from an archive list, try fetching by ID
                 try:
                     thread = await client.fetch_channel(int(thread_id))
                     if not isinstance(thread, discord.Thread):
                         gui_queue.put(("status_update", f"Warning: ID {thread_id} is not a valid thread. Skipping."))
                         continue
                 except discord.NotFound:
                     gui_queue.put(("status_update", f"Warning: Thread with ID {thread_id} not found. Skipping."))
                     continue
                 except discord.Forbidden:
                     gui_queue.put(("status_update", f"Warning: No permission to fetch thread ID {thread_id}. Skipping."))
                     continue
                 except Exception as e:
                      gui_queue.put(("status_update", f"Error fetching thread ID {thread_id}: {e}. Skipping."))
                      continue

            gui_queue.put(("status_update", f"Fetching history for thread: '{thread.name}'..."))
            message_count = 0
            # Fetch all messages, oldest first
            async for message in thread.history(limit=None, oldest_first=True):
                # Basic check to ignore bot messages if desired (optional)
                # if message.author.bot:
                #    continue
                all_messages.append({
                    'timestamp': message.created_at,
                    'author_id': message.author.id,
                    'author_name': str(message.author), # Includes discriminator initially
                    'author_nick': message.author.display_name if isinstance(message.author, discord.Member) else message.author.name, # Use display name (nickname) if available
                    'content': message.content,
                    'attachments': [att.url for att in message.attachments],
                    'thread_id': thread.id,
                    'thread_name': thread.name,
                    'channel_id': thread.parent_id,
                })
                message_count += 1
                if message_count % 100 == 0: # Update status periodically
                     gui_queue.put(("status_update", f"Fetched {message_count} messages from '{thread.name}'..."))

            gui_queue.put(("status_update", f"Finished fetching {message_count} messages from '{thread.name}'."))

        except discord.Forbidden:
            gui_queue.put(("status_update", f"Error: No permission to read history for thread ID {thread_id}. Skipping."))
        except discord.HTTPException as e:
             gui_queue.put(("status_update", f"Error fetching messages (HTTP {e.status}): {e.text}. Skipping thread ID {thread_id}."))
        except Exception as e:
            gui_queue.put(("status_update", f"Error processing thread ID {thread_id}: {e}. Skipping."))

    gui_queue.put(("status_update", "Finished fetching all messages. Processing..."))

    # --- Process Messages ---
    if not all_messages:
        gui_queue.put(("status_update", "No messages found in selected threads."))
        gui_queue.put(("processing_done", None)) # Signal completion
        return

    # Sort all collected messages chronologically
    all_messages.sort(key=lambda m: m['timestamp'])

    # Prepare data for saving
    character_messages = {} # {author_nick: [{'timestamp': ..., 'content': ...}]}
    general_plot = [] # List of formatted strings for general plot

    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        gui_queue.put(("status_update", f"Created output directory: {output_dir}"))

    output_subdir = os.path.join(output_dir, f"summary_{datetime.now():%Y%m%d_%H%M%S}")
    os.makedirs(output_subdir)
    gui_queue.put(("status_update", f"Saving results to: {output_subdir}"))

    general_plot_filename = os.path.join(output_subdir, "_General_Plot_Log.md")
    character_dir = os.path.join(output_subdir, "Character_Logs")
    os.makedirs(character_dir)

    # Process messages for plot log and character files
    with open(general_plot_filename, 'w', encoding='utf-8') as f_plot:
        f_plot.write(f"# General Plot Log - Generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f_plot.write("## Chronological Message Log\n\n")

        for msg in all_messages:
            ts_str = msg['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
            author_display = msg['author_nick'] # Use nickname/display name

            # Add to general plot log
            plot_entry = f"**[{ts_str}] {author_display}:**\n> {msg['content']}\n\n"
            if msg['attachments']:
                plot_entry += "> Attachments:\n"
                for att_url in msg['attachments']:
                     plot_entry += f"> - {att_url}\n"
                plot_entry += "\n"
            f_plot.write(plot_entry)
            general_plot.append(plot_entry) # Keep in memory if needed for GUI display later

            # Add to character-specific log
            if author_display not in character_messages:
                character_messages[author_display] = []

            character_entry = {
                'timestamp': ts_str,
                'content': msg['content'],
                'attachments': msg['attachments'],
                'thread_name': msg['thread_name'], # Add context
                'thread_id': msg['thread_id']
            }
            character_messages[author_display].append(character_entry)

    gui_queue.put(("status_update", "Saved general plot log."))

    # Save character files
    for character_name, messages in character_messages.items():
        # Sanitize filename
        safe_char_name = re.sub(r'[\\/*?:"<>|]', "", character_name) # Remove invalid filename chars
        if not safe_char_name: safe_char_name = f"character_{messages[0]['author_id']}" # Fallback if name is all invalid chars
        char_filename = os.path.join(character_dir, f"{safe_char_name}.md")

        with open(char_filename, 'w', encoding='utf-8') as f_char:
            f_char.write(f"# Character Log: {character_name}\n\n")
            f_char.write(f"*Generated {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*\n\n")
            f_char.write("## Messages (Chronological)\n\n")

            for entry in messages: # Messages are already sorted overall
                 f_char.write(f"**[{entry['timestamp']}]** (Thread: *{entry['thread_name']}*)\n")
                 f_char.write(f"> {entry['content']}\n")
                 if entry['attachments']:
                     f_char.write("> Attachments:\n")
                     for att_url in entry['attachments']:
                         f_char.write(f"> - {att_url}\n")
                 f_char.write("\n---\n\n") # Separator

    gui_queue.put(("status_update", f"Saved logs for {len(character_messages)} characters."))
    gui_queue.put(("processing_done", output_subdir)) # Signal completion and pass output path

def run_discord_bot():
    """Runs the discord bot in the asyncio event loop."""
    global loop
    try:
        # Ensure the loop is running, or start a new one if needed in the thread
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                 raise RuntimeError("Event loop is closed")
        except RuntimeError:
             loop = asyncio.new_event_loop()
             asyncio.set_event_loop(loop)

        if BOT_TOKEN:
            loop.create_task(client.start(BOT_TOKEN))
            loop.run_forever()
        else:
             # Handle missing token - signal GUI to ask
             gui_queue.put(("request_token", None))

    except discord.LoginFailure:
        gui_queue.put(("status_update", "Error: Invalid Discord Bot Token."))
        gui_queue.put(("fatal_error", None)) # Indicate bot cannot run
    except discord.PrivilegedIntentsRequired:
         gui_queue.put(("status_update", "Error: Missing required Privileged Intents (Server Members or Message Content). Please enable them in the Discord Developer Portal."))
         gui_queue.put(("fatal_error", None))
    except Exception as e:
        error_message = f"An error occurred in the Discord thread: {e}"
        print(error_message) # Also print to console for debugging
        gui_queue.put(("status_update", error_message))
        gui_queue.put(("fatal_error", None)) # Indicate bot cannot run
    finally:
        if loop.is_running():
             # Gently stop the bot if the loop is still running (e.g., GUI closed)
             loop.call_soon_threadsafe(loop.create_task, client.close())
             # loop.call_soon_threadsafe(loop.stop) # Stop the loop itself
        print("Discord bot loop finished.")


# --- Tkinter GUI Logic (runs in the main thread) ---

class DiscordSummarizerApp:
    def __init__(self, master):
        self.master = master
        master.title("Discord TTRPG Summarizer")
        master.geometry("700x650")

        self.selected_guild_id = tk.StringVar()
        self.selected_channel_ids = [] # Store IDs
        self.selected_thread_ids = [] # Store IDs
        self.output_directory = tk.StringVar(value=os.path.join(os.getcwd(), "Discord_Summaries"))

        # Style
        style = ttk.Style()
        style.theme_use('clam') # Or 'alt', 'default', 'classic'

        # --- Frames ---
        top_frame = ttk.Frame(master, padding="10")
        top_frame.pack(fill=tk.X)

        middle_frame = ttk.Frame(master, padding="10")
        middle_frame.pack(fill=tk.BOTH, expand=True)

        bottom_frame = ttk.Frame(master, padding="10")
        bottom_frame.pack(fill=tk.X)

        # --- Top Frame: Controls ---
        ttk.Label(top_frame, text="Bot Token:").grid(row=0, column=0, padx=5, pady=5, sticky=tk.W)
        self.token_entry = ttk.Entry(top_frame, width=40, show="*")
        self.token_entry.grid(row=0, column=1, padx=5, pady=5, sticky=tk.W)
        self.connect_button = ttk.Button(top_frame, text="Connect Bot", command=self.connect_bot)
        self.connect_button.grid(row=0, column=2, padx=5, pady=5)

        ttk.Label(top_frame, text="Select Server:").grid(row=1, column=0, padx=5, pady=5, sticky=tk.W)
        self.guild_combobox = ttk.Combobox(top_frame, textvariable=self.selected_guild_id, state="readonly", width=37)
        self.guild_combobox.grid(row=1, column=1, padx=5, pady=5, sticky=tk.W)
        self.guild_combobox.bind("<<ComboboxSelected>>", self.on_guild_select)

        # --- Middle Frame: Selections ---
        # Channels List
        ch_frame = ttk.LabelFrame(middle_frame, text="Select Channel(s)", padding="5")
        ch_frame.grid(row=0, column=0, padx=5, pady=5, sticky="nsew")
        self.channel_listbox = tk.Listbox(ch_frame, selectmode=tk.EXTENDED, exportselection=False, width=35, height=10)
        self.channel_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        ch_scrollbar = ttk.Scrollbar(ch_frame, orient=tk.VERTICAL, command=self.channel_listbox.yview)
        ch_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.channel_listbox.config(yscrollcommand=ch_scrollbar.set)
        self.channel_listbox.bind("<<ListboxSelect>>", self.on_channel_select)

        # Threads List
        th_frame = ttk.LabelFrame(middle_frame, text="Select Thread(s)", padding="5")
        th_frame.grid(row=0, column=1, padx=5, pady=5, sticky="nsew")
        self.thread_listbox = tk.Listbox(th_frame, selectmode=tk.EXTENDED, exportselection=False, width=35, height=10)
        self.thread_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        th_scrollbar = ttk.Scrollbar(th_frame, orient=tk.VERTICAL, command=self.thread_listbox.yview)
        th_scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        self.thread_listbox.config(yscrollcommand=th_scrollbar.set)
        self.thread_listbox.bind("<<ListboxSelect>>", self.on_thread_select)

        middle_frame.columnconfigure(0, weight=1)
        middle_frame.columnconfigure(1, weight=1)
        middle_frame.rowconfigure(0, weight=1)

        # --- Bottom Frame: Actions & Status ---
        action_frame = ttk.Frame(bottom_frame)
        action_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(action_frame, text="Output Directory:").pack(side=tk.LEFT, padx=5)
        self.output_entry = ttk.Entry(action_frame, textvariable=self.output_directory, width=40)
        self.output_entry.pack(side=tk.LEFT, padx=5)
        self.browse_button = ttk.Button(action_frame, text="Browse...", command=self.browse_output_dir)
        self.browse_button.pack(side=tk.LEFT, padx=5)

        self.process_button = ttk.Button(bottom_frame, text="Fetch Messages & Generate Summary", command=self.start_processing, state=tk.DISABLED)
        self.process_button.pack(pady=5)

        status_frame = ttk.LabelFrame(bottom_frame, text="Status Log", padding="5")
        status_frame.pack(fill=tk.BOTH, expand=True)
        self.status_text = scrolledtext.ScrolledText(status_frame, height=8, wrap=tk.WORD, state=tk.DISABLED)
        self.status_text.pack(fill=tk.BOTH, expand=True)

        # --- Initial State ---
        self.update_status("GUI Initialized. Enter Bot Token and click 'Connect Bot'.")
        self.guild_combobox['state'] = tk.DISABLED
        self.channel_listbox['state'] = tk.DISABLED
        self.thread_listbox['state'] = tk.DISABLED

        # Check for token at start
        if BOT_TOKEN:
             self.token_entry.insert(0, BOT_TOKEN)
             self.connect_bot() # Auto-connect if token is hardcoded/loaded


        # Start checking the queue for updates from the Discord thread
        self.master.after(100, self.process_queue)

    def update_status(self, message):
        """Appends a message to the status text area."""
        now = datetime.now().strftime('%H:%M:%S')
        self.status_text.config(state=tk.NORMAL)
        self.status_text.insert(tk.END, f"[{now}] {message}\n")
        self.status_text.config(state=tk.DISABLED)
        self.status_text.see(tk.END) # Scroll to the bottom

    def process_queue(self):
        """Processes items from the GUI queue."""
        try:
            while True:
                task = gui_queue.get_nowait()
                task_type, data = task

                if task_type == "update_guilds":
                    self.handle_guild_update(data)
                elif task_type == "update_channels":
                    self.handle_channel_update(data)
                elif task_type == "status_update":
                    self.update_status(data)
                elif task_type == "processing_done":
                    self.handle_processing_done(data)
                elif task_type == "request_token":
                     self.update_status("Bot Token not found. Please enter it and click 'Connect Bot'.")
                     self.connect_button['state'] = tk.NORMAL
                elif task_type == "fatal_error":
                     self.update_status("A fatal error occurred in the Discord bot. Please check console/logs and restart.")
                     self.connect_button['state'] = tk.NORMAL # Allow trying again
                     # Disable further actions
                     self.guild_combobox['state'] = tk.DISABLED
                     self.channel_listbox['state'] = tk.DISABLED
                     self.thread_listbox['state'] = tk.DISABLED
                     self.process_button['state'] = tk.DISABLED


        except queue.Empty:
            pass # No tasks in queue
        finally:
            # Reschedule the queue check
            self.master.after(100, self.process_queue)

    def handle_guild_update(self, guilds):
        """Updates the guild combobox."""
        global guild_data
        guild_data = guilds
        guild_names = list(guilds.values())
        self.guild_combobox['values'] = guild_names
        if guild_names:
            self.guild_combobox['state'] = 'readonly'
            self.update_status(f"Fetched {len(guild_names)} server(s). Please select one.")
        else:
            self.guild_combobox['state'] = tk.DISABLED
            self.update_status("No servers found for this bot. Invite it to a server first.")
        self.connect_button.config(text="Reconnect Bot", state=tk.NORMAL)


    def handle_channel_update(self, data):
        """Updates the channel and thread listboxes."""
        global channel_data, thread_data
        guild_id, channels, threads = data
        
        # Ensure data structure exists
        if guild_id not in channel_data:
            channel_data[guild_id] = {}
        if guild_id not in thread_data:
             thread_data[guild_id] = {}

        channel_data[guild_id] = channels
        # Threads are nested by channel_id in the received 'threads' dict
        thread_data[guild_id] = threads

        self.channel_listbox.delete(0, tk.END)
        self.thread_listbox.delete(0, tk.END) # Clear threads when channels are updated

        if channels:
            # Store ID along with name for lookup
            self.channel_id_map = {name: cid for cid, name in channels.items()}
            sorted_channel_names = sorted(channels.values(), key=str.lower)
            for name in sorted_channel_names:
                self.channel_listbox.insert(tk.END, name)
            self.channel_listbox['state'] = tk.NORMAL
            self.update_status(f"Fetched {len(channels)} text channels. Select channel(s) to see their threads.")
        else:
            self.channel_listbox['state'] = tk.DISABLED
            self.update_status("No text channels found or accessible in this server.")
        
        self.thread_listbox['state'] = tk.DISABLED # Disable threads until a channel is selected
        self.process_button['state'] = tk.DISABLED # Disable processing until threads are selected


    def handle_processing_done(self, output_path):
         """Called when message processing is finished."""
         self.process_button['state'] = tk.NORMAL # Re-enable button
         if output_path:
             self.update_status(f"Successfully generated summary! Files saved in: {output_path}")
             # Ask user if they want to open the output directory
             if messagebox.askyesno("Success!", f"Summary generated successfully in:\n{output_path}\n\nDo you want to open this folder?"):
                  try:
                      if os.name == 'nt': # Windows
                          os.startfile(output_path)
                      elif os.name == 'posix': # macOS, Linux
                           import subprocess
                           try: # Try xdg-open first (Linux)
                               subprocess.check_call(['xdg-open', output_path])
                           except FileNotFoundError: # Fallback for macOS or if xdg-open fails
                               subprocess.check_call(['open', output_path])
                      else:
                           self.update_status("Cannot automatically open folder on this OS.")
                  except Exception as e:
                      self.update_status(f"Could not open output folder automatically: {e}")
         else:
             self.update_status("Processing finished, but no output path was returned (maybe no messages found?).")


    def connect_bot(self):
        global BOT_TOKEN, discord_thread
        token = self.token_entry.get()
        if not token:
            messagebox.showerror("Error", "Please enter the Bot Token.")
            return
        
        BOT_TOKEN = token # Store token globally for the bot thread
        self.token_entry.config(show="*") # Keep hiding it
        self.update_status("Connecting to Discord...")
        self.connect_button.config(text="Connecting...", state=tk.DISABLED)
        self.guild_combobox['state'] = tk.DISABLED
        self.channel_listbox['state'] = tk.DISABLED
        self.thread_listbox['state'] = tk.DISABLED
        self.process_button['state'] = tk.DISABLED

        # Start the Discord bot in a separate thread if not already running
        if discord_thread is None or not discord_thread.is_alive():
            discord_thread = threading.Thread(target=run_discord_bot, daemon=True)
            discord_thread.start()
            # Give it a moment to initialize, then request guilds
            self.master.after(1500, self.request_guilds) # Increased delay slightly
        else:
             # If thread exists, maybe just re-request guilds (e.g., reconnect button)
             self.update_status("Already connected. Fetching servers...")
             self.request_guilds()


    def request_guilds(self):
         """Safely schedules the fetch_guilds coroutine."""
         if client.is_ready():
             asyncio.run_coroutine_threadsafe(fetch_guilds(), loop)
             self.update_status("Requesting server list from Discord...")
         else:
             self.update_status("Bot not ready yet, trying again shortly...")
             self.master.after(1000, self.request_guilds) # Retry


    def on_guild_select(self, event=None):
        """Handles selection of a guild."""
        selected_guild_name = self.selected_guild_id.get()
        guild_id = None
        for gid, name in guild_data.items():
            if name == selected_guild_name:
                guild_id = gid
                break

        if guild_id:
            self.update_status(f"Fetching channels for server: {selected_guild_name}...")
            self.channel_listbox.delete(0, tk.END)
            self.thread_listbox.delete(0, tk.END)
            self.channel_listbox['state'] = tk.DISABLED
            self.thread_listbox['state'] = tk.DISABLED
            self.process_button['state'] = tk.DISABLED
             # Schedule the async task to fetch channels
            asyncio.run_coroutine_threadsafe(fetch_channels(guild_id), loop)
        else:
            self.update_status("Error: Could not find ID for selected server.")


    def on_channel_select(self, event=None):
        """Handles selection of channels, updates thread list."""
        selected_indices = self.channel_listbox.curselection()
        self.selected_channel_ids = []
        selected_channel_names = []

        if not hasattr(self, 'channel_id_map'): return # Not ready yet

        for i in selected_indices:
             name = self.channel_listbox.get(i)
             selected_channel_names.append(name)
             if name in self.channel_id_map:
                 self.selected_channel_ids.append(self.channel_id_map[name])

        self.update_thread_listbox()
        self.update_process_button_state()


    def update_thread_listbox(self):
        """Populates the thread listbox based on selected channels."""
        self.thread_listbox.delete(0, tk.END)
        self.thread_listbox['state'] = tk.DISABLED
        self.thread_id_map = {} # Reset map {thread_name_with_channel: thread_id}

        current_guild_id = None
        selected_guild_name = self.selected_guild_id.get()
        for gid, name in guild_data.items():
            if name == selected_guild_name:
                current_guild_id = gid
                break
        
        if not current_guild_id or current_guild_id not in thread_data:
            return # No guild selected or no thread data for it

        threads_to_display = []
        guild_threads = thread_data.get(current_guild_id, {}) # Get threads for this guild

        for channel_id in self.selected_channel_ids:
            channel_name = channel_data.get(current_guild_id, {}).get(channel_id, f"UnknownChannel_{channel_id}")
            # guild_threads now contains {channel_id: {thread_id: thread_name}}
            channel_specific_threads = guild_threads.get(channel_id, {}) # Get threads specifically for this channel
            for thread_id, thread_name in channel_specific_threads.items():
                display_name = f"[{channel_name}] {thread_name}"
                threads_to_display.append((display_name, thread_id))
                self.thread_id_map[display_name] = thread_id # Store mapping

        if threads_to_display:
            threads_to_display.sort(key=lambda x: x[0].lower()) # Sort by display name
            for display_name, _ in threads_to_display:
                self.thread_listbox.insert(tk.END, display_name)
            self.thread_listbox['state'] = tk.NORMAL
            self.update_status(f"Found {len(threads_to_display)} thread(s) in selected channel(s). Select threads to process.")
        else:
             self.update_status("No threads found in the selected channel(s).")
        
        # Clear previous thread selections when the list updates
        self.selected_thread_ids = []
        self.update_process_button_state()


    def on_thread_select(self, event=None):
        """Handles selection of threads."""
        selected_indices = self.thread_listbox.curselection()
        self.selected_thread_ids = []

        if not hasattr(self, 'thread_id_map'): return # Not ready yet

        for i in selected_indices:
             display_name = self.thread_listbox.get(i)
             if display_name in self.thread_id_map:
                 self.selected_thread_ids.append(self.thread_id_map[display_name])

        self.update_process_button_state()


    def update_process_button_state(self):
         """Enables or disables the process button based on thread selection."""
         if self.selected_thread_ids:
             self.process_button['state'] = tk.NORMAL
         else:
             self.process_button['state'] = tk.DISABLED


    def browse_output_dir(self):
        """Opens a directory selection dialog."""
        dir_path = filedialog.askdirectory(initialdir=self.output_directory.get())
        if dir_path:
            self.output_directory.set(dir_path)
            self.update_status(f"Output directory set to: {dir_path}")

    def start_processing(self):
        """Starts the message fetching and processing task."""
        if not self.selected_thread_ids:
            messagebox.showwarning("Warning", "Please select at least one thread to process.")
            return

        output_dir = self.output_directory.get()
        if not output_dir:
             messagebox.showwarning("Warning", "Please specify an output directory.")
             return

        if not os.path.isdir(output_dir):
             # Ask to create if it doesn't exist
             if messagebox.askyesno("Create Directory?", f"The output directory:\n{output_dir}\ndoes not exist. Create it?"):
                 try:
                     os.makedirs(output_dir)
                     self.update_status(f"Created output directory: {output_dir}")
                 except Exception as e:
                      messagebox.showerror("Error", f"Failed to create directory:\n{e}")
                      return
             else:
                 return # User chose not to create


        self.update_status(f"Starting processing for {len(self.selected_thread_ids)} selected threads...")
        self.process_button['state'] = tk.DISABLED # Disable while processing

        # Schedule the async task
        asyncio.run_coroutine_threadsafe(
            fetch_messages_from_threads(self.selected_thread_ids, output_dir),
            loop
        )


# --- Main Execution ---
def on_closing():
    """Handles window closing event."""
    global loop, discord_thread
    print("Closing application...")
    if messagebox.askokcancel("Quit", "Do you want to quit? This will stop the bot connection."):
        if client and client.is_ready() and loop and loop.is_running():
             print("Requesting Discord bot logout...")
             # Schedule the logout task in the bot's event loop
             future = asyncio.run_coroutine_threadsafe(client.close(), loop)
             try:
                 # Wait briefly for the logout task to complete
                 future.result(timeout=5)
                 print("Logout successful.")
             except asyncio.TimeoutError:
                 print("Logout timed out.")
             except Exception as e:
                 print(f"Error during logout: {e}")
             
             # Attempt to stop the loop - might not always work cleanly from here
             # loop.call_soon_threadsafe(loop.stop)

        # Ensure the main Tkinter window is destroyed
        if root:
             root.destroy()
        print("GUI destroyed.")
        # Optionally wait for the thread to finish if needed, though daemon=True helps
        # if discord_thread and discord_thread.is_alive():
        #     discord_thread.join(timeout=5)
        #     print("Discord thread joined.")
        
        # Force exit if necessary (use with caution)
        # os._exit(0)


if __name__ == "__main__":
    root = tk.Tk()
    app = DiscordSummarizerApp(root)
    root.protocol("WM_DELETE_WINDOW", on_closing) # Handle window close button
    root.mainloop()

    # This part might not be reached if on_closing exits uncleanly
    print("Application has exited.")
    # Make sure the loop is stopped if it's still running somehow
    # if loop and loop.is_running():
    #     loop.stop()