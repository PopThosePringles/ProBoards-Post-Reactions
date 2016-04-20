class Post_Reactions {

	static init(){
		if(typeof yootil == "undefined"){
			return;
		}

		let location_check = (
			yootil.location.recent_posts() ||
			yootil.location.search_results() ||
			yootil.location.thread()
		);

		if(!location_check){
			return;
		}

		this.setup();

		if(yootil.user.logged_in()){
			this.create_reaction_button();
		}

		//yootil.event.after_search(this.create_post_reactions);
		this.create_post_reactions();
	}

	static setup(){
		this.KEY = "pixeldepth_post_reactions";
		this.plugin = proboards.plugin.get(this.KEY);

		if(this.plugin && this.plugin.settings){
			this.settings = this.plugin.settings || {};
			this.settings.images = this.plugin.images;
		}

		// Create post lookup table for data

		this.lookup = new Map();
		let post_data = proboards.plugin.keys.data[this.KEY];

		for(var key in post_data){
			this.lookup.set(key, new Post_Reaction_Data(key, post_data[key]));
		}
	}

	static get_data(post_id){
		if(!this.lookup.has(post_id.toString())){
			this.lookup.set(post_id.toString(), new Post_Reaction_Data(post_id));
		}

		return this.lookup.get(post_id.toString());
	}

	/**
	 * TODO: use plugin settings for the text on button.
	 */

	static create_reaction_button(){
		let $controls = yootil.get.post_controls();

		$controls.each(function(){
			let post_id = Post_Reactions.fetch_post_id(this);
			let word = "Add";

			if(post_id){
				let user_id = yootil.user.id();
				let reaction_data = Post_Reactions.get_data(post_id);
				let has_reacted = (reaction_data && reaction_data.contains(user_id))? true : false;

				if(has_reacted){
					word = "Remove";
				}

				let $button = $("<a href='#' data-reaction='" + post_id + "' role='button' class='button'>" + word + " Reaction</a>");

				$button.on("click", Post_Reactions.button_handler.bind($button, post_id, user_id));

				$(this).prepend($button);
			}
		});
	}

	static button_handler(post_id, user_id){
		if(!yootil.key.write(Post_Reactions.KEY, post_id)){
			pb.window.alert("Permission Denied", "You do not have the permission to write to the key for the Post Reactions plugin.");
			return false;
		} else if(yootil.key.space_left(Post_Reactions.KEY) <= 30){
			pb.window.alert("Post Key Full", "Unfortunately your reaction cannot be saved for this post, as it is out of space.");
			return false;
		}

		let reaction_data = Post_Reactions.get_data(post_id);
		let has_reacted = (reaction_data && reaction_data.contains(user_id))? true : false;

		if(!has_reacted){
			Post_Reactions.add(reaction_data, post_id, user_id);
		} else {
			Post_Reactions.remove(reaction_data, post_id, user_id);
		}

		return false;
	}

	static add(reaction_data, post_id, user_id){
		pb.window.dialog("pd-post-reactions-dialog", {
			modal: true,
			height: Post_Reactions.settings.dialog_height,
			width: Post_Reactions.settings.dialog_width,
			title: Post_Reactions.settings.dialog_title,
			html: Post_Reactions.possible_reactions(),
			resizable: false,
			draggable: false,
			dialogClass: "pd-post-reactions-dialog",

			open: function(){
				let $reaction_dialog = $(this);
				let $btn = $("div.pd-post-reactions-dialog").find("button#btn-add-reaction");
				let $items = $reaction_dialog.find("span.pd-post-reactions-dialog-item");

				$btn.css("opacity", 0.6);

				$items.click(function(){
					$items.css("opacity", 0.5).removeAttr("data-selected");
					$(this).css("opacity", 1).attr("data-selected", "selected");

					$btn.css("opacity", 1);
				});
			},

			buttons: [

				{

					text: "Close",
					click: function(){
						$(this).dialog("close");
					}

				},

				{

					id: "btn-add-reaction",
					text: "Add Reaction",
					click: function(){
						let $reaction_dialog = $(this);
						let $selected_item = $reaction_dialog.find("span.pd-post-reactions-dialog-item[data-selected]");

						if($selected_item.length == 1){
							let id = ~~ $selected_item.attr("data-reaction");

							reaction_data.add(user_id, id);
							$("a.button[data-reaction='" + post_id + "']").text("Remove Reaction");

							Post_Reactions.update_post(post_id, true);

							$reaction_dialog.dialog("close");

						}
					}

				}

			]

		});

		return false;
	}

	static remove(reaction_data, post_id, user_id){
		reaction_data.remove(user_id);
		$("a.button[data-reaction='" + post_id + "']").text("Add Reaction");
	}

	static possible_reactions(){
		let html = "";

		html += "<div class='pd-post-reactions-table'>";
			html += "<div class='pd-post-reactions-row'>";

			let counter = 0;
			let iterator = this.settings.possible_reactions[Symbol.iterator]();
			let item = iterator.next();

			while(!item.done){
				html += "<div class='pd-post-reactions-cell'>";
					html += "<span class='pd-post-reactions-dialog-item' data-reaction='" + item.value.unique_id + "'>";
						html += "<img src='" + item.value.image_url + "' title='" + item.value.title + "' />";
					html += "</span>";
				html += "</div>";

				item = iterator.next();
				counter ++;

				if(counter == Post_Reactions.settings.reactions_per_row){
					html += "</div><div class='pd-post-reactions-row'>";
					counter = 0;
				}
			}

			html += "</div>";
		html += "</div>";

		return html;
	}

	static fetch_post_id(control){
		let $post_row = $(control).closest("tr.item.post");
		let post_id_parts = ($post_row.attr("id") || "").split("-");

		if(post_id_parts && post_id_parts.length == 2){
			return ~~ post_id_parts[1];
		}

		return 0;
	}

	static update_post(post_id = 0, adding = true){
		if(post_id){
			let $post_row = $("tr.item.post#post-" + post_id);
			let $table = $post_row.find("table[role='grid']:first");
			let $left_cell = $table.find("td.left-panel");
			let row_span = ~~ $left_cell.attr("rowspan");
			let $reactions_row = $table.find("tr.pd-post-reactions-row");

			if(!$reactions_row.length){
				let row = document.createElement("tr");
				let cell = document.createElement("td");

				cell.innerHTML = Post_Reactions.fetch_post_reactions(post_id);
				row.appendChild(cell);

				$table.find("tbody:first").append(row);

				$left_cell.attr("rowspan", row_span + 1);
			} else {

			}
		}
	}

	static create_post_reactions(){

	}

	static fetch_post_reactions(post_id){

	}

}

$(Post_Reactions.init);
